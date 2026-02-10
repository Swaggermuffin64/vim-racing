import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { Matchmaker } from './matchmaker.js';
import type { ClientMessage, ServerMessage, QueuedPlayer } from './types.js';
import { verifyToken } from './auth.js';
import { rateLimiter } from './rateLimit.js';
import { connectionLimiter } from './connectionLimiter.js';
import { validatePlayerName } from './validation.js';
import { generatePracticeSession } from './practice/tasks.js';

// Track connection metadata
const connectionMeta = new Map<string, { ip: string }>();

/**
 * Extract client IP from request, handling proxies
 */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be comma-separated list, take first
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip?.trim() || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
}

// Auth is required in production, optional in development
const REQUIRE_AUTH = process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true';

const PORT = parseInt(process.env.PORT || '3002', 10);
const PLAYERS_PER_MATCH = parseInt(process.env.PLAYERS_PER_MATCH || '2', 10);

// Validate required env vars
if (!process.env.HATHORA_APP_ID || !process.env.HATHORA_TOKEN) {
  console.error('❌ Missing required environment variables:');
  console.error('   HATHORA_APP_ID and HATHORA_TOKEN must be set');
  console.error('');
  console.error('   Create a .env file with:');
  console.error('   HATHORA_APP_ID=your_app_id');
  console.error('   HATHORA_DEV_TOKEN=your_dev_token');
  process.exit(1);
}

const matchmaker = new Matchmaker({
  playersPerMatch: PLAYERS_PER_MATCH,
});

// CORS headers for HTTP responses
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Create HTTP server to handle both HTTP requests and WebSocket upgrades
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'vim-racing-matchmaking' }));
    return;
  }

  // Practice session endpoint
  if (req.url === '/api/task/practice' && req.method === 'GET') {
    const session = generatePracticeSession(10);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(session));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
  const connectionId = randomUUID().slice(0, 8);
  const clientIp = getClientIp(req);
  
  // Check connection limit
  if (!connectionLimiter.addConnection(clientIp, connectionId)) {
    console.log(`🚫 Connection limit exceeded for IP ${clientIp}`);
    send(socket, { type: 'error', message: 'Too many connections from your IP. Please try again later.' });
    socket.close();
    return;
  }
  
  // Store metadata for cleanup
  connectionMeta.set(connectionId, { ip: clientIp });
  
  console.log(`🔌 New connection: ${connectionId} from ${clientIp} (${connectionLimiter.getConnectionCount(clientIp)}/5)`);

  socket.on('message', (data) => {
    // Check rate limit
    if (!rateLimiter.check(connectionId)) {
      send(socket, { type: 'error', message: 'Too many requests. Please slow down.' });
      return;
    }
    
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      handleMessage(socket, connectionId, message);
    } catch (err) {
      send(socket, { type: 'error', message: 'Invalid message format' });
    }
  });

  socket.on('close', async () => {
    // Clean up connection tracking
    const meta = connectionMeta.get(connectionId);
    if (meta) {
      connectionLimiter.removeConnection(meta.ip, connectionId);
      connectionMeta.delete(connectionId);
    }
    
    rateLimiter.remove(connectionId);
    await matchmaker.removePlayerBySocket(socket);
    console.log(`🔌 Connection closed: ${connectionId}`);
  });

  socket.on('error', (err) => {
    console.error(`❌ Socket error (${connectionId}):`, err.message);
  });
});

async function handleMessage(socket: WebSocket, connectionId: string, message: ClientMessage) {
  switch (message.type) {
    case 'queue:join': {
      // Verify auth token
      const authResult = verifyToken(message.token, REQUIRE_AUTH);
      if (!authResult.success) {
        console.log(`🔒 Auth failed for ${connectionId}: ${authResult.error}`);
        send(socket, { type: 'error', message: authResult.error || 'Authentication failed' });
        return;
      }
      console.log(`🔒 Auth success for ${connectionId}: userId=${authResult.userId}`);
      
      // Validate and sanitize player name
      const nameResult = validatePlayerName(message.playerName);
      const safeName = nameResult.value || 'Anonymous';
      
      // Remove from queue if already queued (rejoin)
      await matchmaker.removePlayerBySocket(socket);

      // Use authenticated userId as playerId for consistency
      const playerId = authResult.userId || randomUUID();
      const player: QueuedPlayer = {
        id: playerId,
        name: safeName,
        socket,
        queuedAt: Date.now(),
      };

      await matchmaker.addPlayer(player);
      
      send(socket, { type: 'queue:joined', playerId });
      break;
    }

    case 'queue:leave': {
      const removed = await matchmaker.removePlayerBySocket(socket);
      if (removed) {
        send(socket, { type: 'queue:left' });
      }
      break;
    }

    case 'ping': {
      send(socket, { type: 'pong' });
      break;
    }

    default:
      send(socket, { type: 'error', message: 'Unknown message type' });
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  matchmaker.stop();
  wss.close(() => {
    server.close(() => {
      console.log('👋 Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down...');
  matchmaker.stop();
  wss.close(() => {
    server.close(() => {
      console.log('👋 Server closed');
      process.exit(0);
    });
  });
});

// Start HTTP server (WebSocket server is attached to it)
server.listen(PORT, () => {
  matchmaker.start();
  console.log(`🚀 Matchmaking server running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Practice API: http://localhost:${PORT}/api/task/practice`);
  console.log(`   Hathora App ID: configured`);
  console.log(`   Players per match: ${PLAYERS_PER_MATCH}`);
  console.log(`   Auth required: ${REQUIRE_AUTH}`);
});

