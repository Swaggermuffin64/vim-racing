import WebSocket from 'ws';
import { io, Socket } from 'socket.io-client';

// Configuration from environment
// Usage:
//   Local:      NUM_GAMES=5 tsx scripts/full-game-test.ts
//   Production: MATCHMAKING_URL=wss://your-matchmaker.example.com NUM_GAMES=5 tsx scripts/full-game-test.ts
//   Viral test: MATCHMAKING_URL=wss://your-matchmaker.example.com VIRAL=1 tsx scripts/full-game-test.ts

const LOCAL_MATCHMAKING_URL = 'ws://localhost:3002';

const MATCHMAKING_URL = process.env.MATCHMAKING_URL || LOCAL_MATCHMAKING_URL;

if (!process.env.MATCHMAKING_URL) {
  console.log('ℹ️  No MATCHMAKING_URL set, defaulting to local:', LOCAL_MATCHMAKING_URL);
}

const NUM_GAMES = parseInt(process.env.NUM_GAMES || '5', 10);
const STAGGER_MS = parseInt(process.env.STAGGER_MS || '200', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '120000', 10);
const TASK_DELAY_MS = parseInt(process.env.TASK_DELAY_MS || '100', 10); // Delay between solving tasks
const VIRAL_MODE = !!process.env.VIRAL;

// Viral mode: simulates traffic ramping up like a streamer raid
// Waves get progressively faster to test rate limiting and requeue
interface Wave {
  players: number;    // Number of players in this wave
  staggerMs: number;  // Delay between players
  pauseAfterMs: number; // Pause before next wave
}

const VIRAL_WAVES: Wave[] = [
  { players: 10, staggerMs: 500, pauseAfterMs: 2000 },   // Slow start: 10 players
  { players: 20, staggerMs: 200, pauseAfterMs: 2000 },   // Picking up: 20 players  
  { players: 40, staggerMs: 100, pauseAfterMs: 2000 },   // Getting busy: 40 players
  { players: 80, staggerMs: 50, pauseAfterMs: 2000 },    // Viral spike: 80 players
  { players: 100, staggerMs: 20, pauseAfterMs: 3000 },   // Peak load: 100 players (will hit rate limits)
  { players: 50, staggerMs: 100, pauseAfterMs: 0 },      // Tapering off: 50 players
];

// Task types from backend
interface Task {
  id: string;
  type: 'navigate' | 'delete' | 'change';
  description: string;
  codeSnippet: string;
  targetOffset?: number;
  expectedResult?: string;
  targetRange?: { from: number; to: number };
}

// Stats tracking
const stats = {
  matchmakingConnected: 0,
  matchmakingQueued: 0,
  matchmakingMatched: 0,
  requeued: 0,
  gameServerConnected: 0,
  gamesStarted: 0,
  gamesCompleted: 0,
  tasksCompleted: 0,
  errors: 0,
  matchTimes: [] as number[],
  gameTimes: [] as number[],
  startTime: Date.now(),
};

interface GameResult {
  playerName: string;
  matchTime: number;
  gameTime: number;
  tasksCompleted: number;
  position: number;
  error?: string;
}

const results: GameResult[] = [];
const activeConnections: (WebSocket | Socket)[] = [];

function simulatePlayer(playerNum: number): Promise<GameResult> {
  return new Promise((resolve) => {
    const playerName = `Bot_${playerNum}_${Date.now()}`;
    const matchmakingStartTime = Date.now();
    let matchTime = 0;
    let gameStartTime = 0;
    let tasksCompleted = 0;
    let resolved = false;
    let currentTask: Task | null = null;
    let gameSocket: Socket | null = null;

    const result: GameResult = {
      playerName,
      matchTime: 0,
      gameTime: 0,
      tasksCompleted: 0,
      position: 0,
    };

    const cleanup = (error?: string) => {
      if (!resolved) {
        resolved = true;
        if (error) {
          result.error = error;
          stats.errors++;
        }
        result.matchTime = matchTime;
        result.gameTime = gameStartTime ? Date.now() - gameStartTime : 0;
        result.tasksCompleted = tasksCompleted;
        results.push(result);
        resolve(result);
      }
    };

    // Timeout for this player
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log(`[${playerName}] ⏰ Timeout`);
        cleanup('Timeout');
      }
    }, TIMEOUT_MS);

    const clearAndCleanup = (error?: string) => {
      clearTimeout(timeout);
      cleanup(error);
    };

    // Step 1: Connect to matchmaking
    const ws = new WebSocket(MATCHMAKING_URL);
    activeConnections.push(ws);

    ws.on('open', () => {
      stats.matchmakingConnected++;
      console.log(`[${playerName}] 🔌 Matchmaking connected`);
      ws.send(JSON.stringify({ type: 'queue:join', playerName }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'queue:joined':
            stats.matchmakingQueued++;
            console.log(`[${playerName}] 📋 Queued`);
            break;

          case 'match:found': {
            matchTime = Date.now() - matchmakingStartTime;
            stats.matchmakingMatched++;
            stats.matchTimes.push(matchTime);
            console.log(`[${playerName}] ✅ Matched! Room: ${msg.roomId} (${matchTime}ms)`);
            ws.close();

            // Step 2: Connect to game server
            connectToGameServer(msg.roomId, msg.connectionUrl);
            break;
          }

          case 'error':
            // "re-queued" means room creation failed - stay connected and wait
            if (msg.message.includes('re-queued') || msg.message.includes('Failed to create match')) {
              stats.requeued++;
              console.log(`[${playerName}] 🔄 Re-queued, waiting...`);
              // Stay connected - matchmaker will retry
            } else {
              // Actual fatal error
              console.error(`[${playerName}] ❌ Matchmaking error: ${msg.message}`);
              ws.close();
              clearAndCleanup(msg.message);
            }
            break;
        }
      } catch (err) {
        console.error(`[${playerName}] Failed to parse matchmaking message:`, err);
      }
    });

    ws.on('error', (err) => {
      console.error(`[${playerName}] ❌ Matchmaking WebSocket error:`, err.message);
      clearAndCleanup('Matchmaking connection error');
    });

    ws.on('close', () => {
      // Don't cleanup here - we close intentionally after match
    });

    // Step 2: Connect to game server
    function connectToGameServer(roomId: string, connectionUrl: string) {
      console.log(`[${playerName}] 🎮 Connecting to game server: ${connectionUrl}`);

      gameSocket = io(connectionUrl, {
        transports: ['websocket'],
        timeout: 30000,
      });
      activeConnections.push(gameSocket);

      gameSocket.on('connect', () => {
        stats.gameServerConnected++;
        console.log(`[${playerName}] 🎮 Game server connected`);

        // Join the matched room
        gameSocket!.emit('room:join_matched', { roomId, playerName });
      });

      gameSocket.on('room:created', () => {
        console.log(`[${playerName}] 🏠 Room created, waiting for opponent...`);
        // Ready up immediately
        gameSocket!.emit('player:ready_to_play');
      });

      gameSocket.on('room:joined', () => {
        console.log(`[${playerName}] 🏠 Room joined, readying up...`);
        // Ready up immediately
        gameSocket!.emit('player:ready_to_play');
      });

      gameSocket.on('room:player_joined', () => {
        console.log(`[${playerName}] 👤 Opponent joined`);
      });

      gameSocket.on('room:player_ready', () => {
        console.log(`[${playerName}] ✋ A player is ready`);
      });

      gameSocket.on('game:countdown', (data: { seconds: number }) => {
        console.log(`[${playerName}] ⏱️ Countdown: ${data.seconds}`);
      });

      gameSocket.on('game:start', (data: { startTime: number; initialTask: Task; num_tasks: number }) => {
        stats.gamesStarted++;
        gameStartTime = Date.now();
        currentTask = data.initialTask;
        console.log(`[${playerName}] 🏁 Race started! Tasks: ${data.num_tasks}`);

        // Start solving tasks with a small delay to simulate "playing"
        setTimeout(() => solveCurrentTask(), TASK_DELAY_MS);
      });

      gameSocket.on('game:player_finished_task', (data: { playerId: string; taskProgress: number; newTask: Task | undefined }) => {
        tasksCompleted++;
        stats.tasksCompleted++;
        currentTask = data.newTask || null;
        console.log(`[${playerName}] ✅ Task ${data.taskProgress} complete`);

        if (currentTask) {
          // Solve next task after delay
          setTimeout(() => solveCurrentTask(), TASK_DELAY_MS);
        }
      });

      gameSocket.on('game:validation_failed', () => {
        console.log(`[${playerName}] ❌ Validation failed, retrying...`);
        // Retry after delay
        setTimeout(() => solveCurrentTask(), TASK_DELAY_MS);
      });

      gameSocket.on('game:player_finished', (data: { playerId: string; time: number; position: number }) => {
        // Check if it's us
        if (gameSocket?.id === data.playerId) {
          result.position = data.position;
          console.log(`[${playerName}] 🎉 Finished! Position: ${data.position}, Time: ${data.time}ms`);
        }
      });

      gameSocket.on('game:complete', (data: { rankings: Array<{ playerId: string; playerName: string; time: number; position: number }> }) => {
        stats.gamesCompleted++;
        const myRanking = data.rankings.find(r => r.playerName === playerName);
        if (myRanking) {
          result.position = myRanking.position;
          result.gameTime = myRanking.time;
          stats.gameTimes.push(myRanking.time);
        }
        console.log(`[${playerName}] 🏆 Game complete! Rankings:`, data.rankings.map(r => `${r.position}. ${r.playerName} (${r.time}ms)`).join(', '));

        gameSocket?.disconnect();
        clearAndCleanup();
      });

      gameSocket.on('room:error', (data: { message: string }) => {
        // "Cannot reset: game not finished" is a benign error from the backend
        // that happens on first game (resetRoom called before first race)
        if (data.message.includes('Cannot reset')) {
          console.log(`[${playerName}] ⚠️ Ignoring benign error: ${data.message}`);
          return;
        }
        
        console.error(`[${playerName}] ❌ Room error: ${data.message}`);
        gameSocket?.disconnect();
        clearAndCleanup(data.message);
      });

      gameSocket.on('connect_error', (err) => {
        console.error(`[${playerName}] ❌ Game server connection error:`, err.message);
        clearAndCleanup('Game server connection error');
      });

      gameSocket.on('disconnect', (reason) => {
        console.log(`[${playerName}] 🔌 Game server disconnected: ${reason}`);
      });
    }

    // Solve the current task instantly (bot mode)
    function solveCurrentTask() {
      if (!currentTask || !gameSocket || resolved) return;

      console.log(`[${playerName}] 🎯 Solving task: ${currentTask.type}`);

      switch (currentTask.type) {
        case 'navigate':
          if (currentTask.targetOffset !== undefined) {
            gameSocket.emit('player:cursor', { offset: currentTask.targetOffset });
          }
          break;

        case 'delete':
          if (currentTask.expectedResult !== undefined) {
            gameSocket.emit('player:editorText', { text: currentTask.expectedResult });
          }
          break;

        case 'change':
          if (currentTask.expectedResult !== undefined) {
            gameSocket.emit('player:editorText', { text: currentTask.expectedResult });
          }
          break;

        default:
          console.log(`[${playerName}] ⚠️ Unknown task type: ${(currentTask as Task).type}`);
      }
    }
  });
}

function printStats() {
  const duration = (Date.now() - stats.startTime) / 1000;
  
  // Calculate expected totals based on mode
  const totalPlayers = VIRAL_MODE 
    ? VIRAL_WAVES.reduce((sum, wave) => sum + wave.players, 0)
    : NUM_GAMES * 2;
  const totalGames = Math.floor(totalPlayers / 2);

  console.log('\n' + '='.repeat(60));
  console.log(VIRAL_MODE ? '📊 VIRAL TRAFFIC TEST RESULTS' : '📊 FULL GAME LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`   Target: ${MATCHMAKING_URL}`);
  console.log(`   Mode: ${VIRAL_MODE ? 'Viral (ramping waves)' : 'Standard'}`);
  console.log(`   Players: ${totalPlayers} (${totalGames} games)`);
  console.log(`   Task delay: ${TASK_DELAY_MS}ms`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log('-'.repeat(60));
  console.log('   MATCHMAKING:');
  console.log(`     Connected: ${stats.matchmakingConnected}/${totalPlayers}`);
  console.log(`     Queued: ${stats.matchmakingQueued}/${totalPlayers}`);
  console.log(`     Matched: ${stats.matchmakingMatched}/${totalPlayers}`);
  if (stats.requeued > 0) {
    console.log(`     Re-queued (rate limited): ${stats.requeued} 🔄`);
  }
  console.log('-'.repeat(60));
  console.log('   GAME SERVER:');
  console.log(`     Connected: ${stats.gameServerConnected}/${totalPlayers}`);
  console.log(`     Games Started: ${stats.gamesStarted}/${totalGames}`);
  console.log(`     Games Completed: ${stats.gamesCompleted}/${totalGames}`);
  console.log(`     Tasks Completed: ${stats.tasksCompleted}`);
  console.log('-'.repeat(60));
  console.log(`   Errors: ${stats.errors}`);

  if (stats.matchTimes.length > 0) {
    const avg = stats.matchTimes.reduce((a, b) => a + b, 0) / stats.matchTimes.length;
    const sorted = [...stats.matchTimes].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];

    console.log('-'.repeat(60));
    console.log('   MATCH TIMES:');
    console.log(`     Min: ${min}ms | Avg: ${avg.toFixed(0)}ms | P50: ${p50}ms | Max: ${max}ms`);
  }

  if (stats.gameTimes.length > 0) {
    const avg = stats.gameTimes.reduce((a, b) => a + b, 0) / stats.gameTimes.length;
    const sorted = [...stats.gameTimes].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    console.log('-'.repeat(60));
    console.log('   GAME TIMES (winner):');
    console.log(`     Min: ${min}ms | Avg: ${avg.toFixed(0)}ms | Max: ${max}ms`);
  }

  // Show errors if any
  const errorResults = results.filter(r => r.error);
  if (errorResults.length > 0) {
    console.log('-'.repeat(60));
    console.log('   ERRORS:');
    errorResults.forEach(r => {
      console.log(`     ${r.playerName}: ${r.error}`);
    });
  }

  console.log('='.repeat(60) + '\n');
}

async function runViralTest() {
  const totalPlayers = VIRAL_WAVES.reduce((sum, wave) => sum + wave.players, 0);
  const totalGames = Math.floor(totalPlayers / 2);
  
  console.log('🚀 Starting VIRAL Traffic Simulation');
  console.log(`   Target: ${MATCHMAKING_URL}`);
  console.log(`   Mode: Viral (ramping waves)`);
  console.log(`   Total Players: ${totalPlayers} across ${VIRAL_WAVES.length} waves`);
  console.log(`   Task Delay: ${TASK_DELAY_MS}ms`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms per player`);
  console.log('');
  console.log('   Waves:');
  VIRAL_WAVES.forEach((wave, i) => {
    const rate = (1000 / wave.staggerMs).toFixed(1);
    console.log(`     ${i + 1}. ${wave.players} players @ ${wave.staggerMs}ms (${rate}/sec)`);
  });
  console.log('');

  const promises: Promise<GameResult>[] = [];
  let playerNum = 0;

  for (let waveIndex = 0; waveIndex < VIRAL_WAVES.length; waveIndex++) {
    const wave = VIRAL_WAVES[waveIndex];
    const rate = (1000 / wave.staggerMs).toFixed(1);
    console.log(`\n📈 Wave ${waveIndex + 1}: Spawning ${wave.players} players at ${rate}/sec...`);

    for (let i = 0; i < wave.players; i++) {
      playerNum++;
      await new Promise((resolve) => setTimeout(resolve, wave.staggerMs));
      promises.push(simulatePlayer(playerNum));
    }

    if (wave.pauseAfterMs > 0 && waveIndex < VIRAL_WAVES.length - 1) {
      console.log(`   ⏸️  Pausing ${wave.pauseAfterMs}ms before next wave...`);
      await new Promise((resolve) => setTimeout(resolve, wave.pauseAfterMs));
    }
  }

  console.log(`\n⏳ Waiting for all ${totalPlayers} players to complete...`);
  
  // Wait for all players to complete
  await Promise.all(promises);

  // Print final stats
  printStats();

  // Cleanup and exit
  cleanupAndExit(totalGames);
}

async function runFullGameTest() {
  // Delegate to viral test if enabled
  if (VIRAL_MODE) {
    return runViralTest();
  }

  console.log('🚀 Starting Full Game Load Test');
  console.log(`   Target: ${MATCHMAKING_URL}`);
  console.log(`   Games: ${NUM_GAMES} (spawning ${NUM_GAMES * 2} players)`);
  console.log(`   Stagger: ${STAGGER_MS}ms between players`);
  console.log(`   Task Delay: ${TASK_DELAY_MS}ms (simulated play speed)`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms per player`);
  console.log('');

  const promises: Promise<GameResult>[] = [];

  // Spawn pairs of players (each pair = 1 game)
  const totalPlayers = NUM_GAMES * 2;
  for (let i = 0; i < totalPlayers; i++) {
    await new Promise((resolve) => setTimeout(resolve, STAGGER_MS));
    promises.push(simulatePlayer(i + 1));
  }

  // Wait for all players to complete
  await Promise.all(promises);

  // Print final stats
  printStats();

  // Cleanup and exit
  cleanupAndExit(NUM_GAMES);
}

function cleanupAndExit(expectedGames: number) {
  // Close any remaining connections
  activeConnections.forEach((conn) => {
    if (conn instanceof WebSocket) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.close();
      }
    } else {
      conn.disconnect();
    }
  });

  // Exit with error code if not all games completed
  if (stats.gamesCompleted < expectedGames) {
    console.log(`⚠️  Warning: Only ${stats.gamesCompleted}/${expectedGames} games completed`);
    process.exit(1);
  }

  process.exit(0);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user');
  printStats();
  activeConnections.forEach((conn) => {
    if (conn instanceof WebSocket) {
      conn.close();
    } else {
      conn.disconnect();
    }
  });
  process.exit(1);
});

// Run the test
runFullGameTest().catch((err) => {
  console.error('Full game test failed:', err);
  process.exit(1);
});
