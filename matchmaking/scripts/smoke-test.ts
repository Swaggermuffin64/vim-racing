import WebSocket from 'ws';

// Usage:
//   Local:      tsx scripts/smoke-test.ts
//   Production: MATCHMAKING_URL=wss://your-matchmaker.example.com tsx scripts/smoke-test.ts

const LOCAL_WS_URL = 'ws://localhost:3002';

const WS_URL = process.env.MATCHMAKING_URL || LOCAL_WS_URL;

if (!process.env.MATCHMAKING_URL) {
  console.log('ℹ️  No MATCHMAKING_URL set, defaulting to local:', LOCAL_WS_URL);
}

// Convert ws:// → http://, wss:// → https://
const HTTP_URL = WS_URL.replace(/^ws(s?)/, 'http$1');

const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '15000', 10);
const PROD_ORIGIN = 'https://vimgym.app';

// --- Test runner ---

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  ✅ ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  ❌ ${name}: ${error}`);
}

function assert(condition: boolean, name: string, error: string) {
  if (condition) pass(name);
  else fail(name, error);
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// --- Phase 1: HTTP API checks ---

async function httpTests() {
  console.log('\n📡 Phase 1: HTTP API checks');

  // Health check
  try {
    const res = await fetch(`${HTTP_URL}/`);
    assert(res.status === 200, 'Health check returns 200', `got ${res.status}`);
    const body = await res.json();
    assert(body.status === 'ok', 'Health check body has status:ok', `got ${JSON.stringify(body)}`);
  } catch (err: any) {
    fail('Health check', err.message);
  }

  // Practice API
  try {
    const res = await fetch(`${HTTP_URL}/api/task/practice`, {
      headers: { 'Origin': PROD_ORIGIN },
    });
    assert(res.status === 200, 'Practice API returns 200', `got ${res.status}`);

    const body = await res.json();
    assert(Array.isArray(body.tasks), 'Practice API returns tasks array', `tasks is ${typeof body.tasks}`);
    assert(body.tasks.length === 10, 'Practice API returns 10 tasks', `got ${body.tasks?.length}`);

    if (body.tasks.length > 0) {
      const task = body.tasks[0];
      assert(
        typeof task.id === 'string' && typeof task.type === 'string' && typeof task.codeSnippet === 'string',
        'Tasks have required fields (id, type, codeSnippet)',
        `first task: ${JSON.stringify(Object.keys(task))}`,
      );
    }

    // CORS header on the practice response
    const acao = res.headers.get('access-control-allow-origin');
    assert(
      acao === PROD_ORIGIN,
      `CORS header reflects origin (${PROD_ORIGIN})`,
      `Access-Control-Allow-Origin: ${acao ?? '(missing)'}`,
    );
  } catch (err: any) {
    fail('Practice API', err.message);
  }

  // OPTIONS preflight
  try {
    const res = await fetch(`${HTTP_URL}/api/task/practice`, {
      method: 'OPTIONS',
      headers: { 'Origin': PROD_ORIGIN },
    });
    assert(res.status === 204, 'Preflight returns 204', `got ${res.status}`);

    const acao = res.headers.get('access-control-allow-origin');
    assert(
      acao === PROD_ORIGIN,
      'Preflight CORS header reflects origin',
      `Access-Control-Allow-Origin: ${acao ?? '(missing)'}`,
    );

    const methods = res.headers.get('access-control-allow-methods') ?? '';
    assert(
      methods.includes('GET'),
      'Preflight allows GET method',
      `Access-Control-Allow-Methods: ${methods}`,
    );
  } catch (err: any) {
    fail('Preflight', err.message);
  }
}

// --- Phase 2: WebSocket connectivity ---

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket, type: string, opts?: { rejectOnError?: boolean }): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          ws.off('message', onMessage);
          resolve(msg);
        } else if (opts?.rejectOnError && msg.type === 'error') {
          ws.off('message', onMessage);
          reject(new Error(`Server error: ${msg.message || JSON.stringify(msg)}`));
        }
      } catch { /* ignore non-JSON */ }
    };
    ws.on('message', onMessage);
    ws.on('error', reject);
    ws.on('close', () => reject(new Error('WebSocket closed while waiting for ' + type)));
  });
}

async function wsConnectivityTests() {
  console.log('\n🔌 Phase 2: WebSocket connectivity');

  let ws: WebSocket | null = null;

  try {
    ws = await withTimeout(connectWs(), 'WebSocket connect');
    pass('WebSocket connects');

    // Ping / pong
    const pongPromise = waitForMessage(ws, 'pong');
    ws.send(JSON.stringify({ type: 'ping' }));
    await withTimeout(pongPromise, 'Ping/pong');
    pass('Ping → pong');

    // queue:join → queue:joined
    const joinedPromise = waitForMessage(ws, 'queue:joined');
    ws.send(JSON.stringify({ type: 'queue:join', playerName: 'SmokeTest_Connectivity' }));
    const joinedMsg = await withTimeout(joinedPromise, 'queue:join');
    assert(typeof joinedMsg.playerId === 'string', 'queue:joined has playerId', `got ${typeof joinedMsg.playerId}`);

    // queue:leave → queue:left
    const leftPromise = waitForMessage(ws, 'queue:left');
    ws.send(JSON.stringify({ type: 'queue:leave' }));
    await withTimeout(leftPromise, 'queue:leave');
    pass('queue:leave → queue:left');
  } catch (err: any) {
    fail('WebSocket connectivity', err.message);
  } finally {
    ws?.close();
  }
}

// --- Phase 3: Full matchmaking flow ---

async function matchmakingFlowTests() {
  console.log('\n🎮 Phase 3: Matchmaking flow (2-player match)');

  let ws1: WebSocket | null = null;
  let ws2: WebSocket | null = null;

  try {
    // Connect both players
    [ws1, ws2] = await withTimeout(
      Promise.all([connectWs(), connectWs()]),
      'Connect both players',
    );
    pass('Both players connected');

    // Both join queue and wait for match:found
    // Room assignment is fast now but keep a generous timeout for network latency.
    const matchTimeoutMs = Math.max(TIMEOUT_MS, 30000);
    const match1Promise = waitForMessage(ws1, 'match:found', { rejectOnError: true });
    const match2Promise = waitForMessage(ws2, 'match:found', { rejectOnError: true });

    ws1.send(JSON.stringify({ type: 'queue:join', playerName: 'SmokeTest_P1' }));
    ws2.send(JSON.stringify({ type: 'queue:join', playerName: 'SmokeTest_P2' }));

    const matchWithTimeout = <T>(promise: Promise<T>, label: string): Promise<T> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${matchTimeoutMs}ms`)),
          matchTimeoutMs,
        );
        promise.then(
          (val) => { clearTimeout(timer); resolve(val); },
          (err) => { clearTimeout(timer); reject(err); },
        );
      });
    };

    const [match1, match2] = await matchWithTimeout(
      Promise.all([match1Promise, match2Promise]),
      'Wait for match:found',
    );

    pass('Both players received match:found');

    assert(
      typeof match1.roomId === 'string' && match1.roomId.length > 0,
      'match:found has roomId',
      `roomId: ${match1.roomId}`,
    );

    assert(
      typeof match1.connectionUrl === 'string' && match1.connectionUrl.length > 0,
      'match:found has connectionUrl',
      `connectionUrl: ${match1.connectionUrl}`,
    );

    assert(
      match1.roomId === match2.roomId,
      'Both players matched to same room',
      `P1: ${match1.roomId}, P2: ${match2.roomId}`,
    );

    assert(
      Array.isArray(match1.players) && match1.players.length === 2,
      'match:found includes 2 players',
      `players: ${JSON.stringify(match1.players)}`,
    );
  } catch (err: any) {
    fail('Matchmaking flow', err.message);
  } finally {
    ws1?.close();
    ws2?.close();
  }
}

// --- Run all phases ---

async function run() {
  console.log('🚀 Matchmaking Smoke Test');
  console.log(`   Target: ${HTTP_URL} / ${WS_URL}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms`);

  await httpTests();
  await wsConnectivityTests();
  await matchmakingFlowTests();

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n' + '='.repeat(50));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  if (failed > 0) {
    console.log('Failed checks:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    console.log('');
    process.exit(1);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
