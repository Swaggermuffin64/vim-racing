import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { Matchmaker } from './matchmaker.js';
import type { ClientMessage, ServerMessage, QueuedPlayer } from './types.js';
import { verifyToken } from './auth.js';
import { RateLimiter, rateLimiter } from './rateLimit.js';
import { connectionLimiter } from './connectionLimiter.js';
import { validatePlayerName } from './validation.js';
import { generatePracticeSession } from './practice/tasks.js';

// --- CORS Configuration ---
// Allowed origins for CORS - matches the backend's approach
const CORS_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) : []),
];

/**
 * Check if a request origin is allowed by CORS policy.
 * Returns the matched origin string, or null if not allowed.
 */
function getAllowedOrigin(req: IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (!origin) return null;
  return CORS_ORIGINS.includes(origin) ? origin : null;
}

/**
 * Build CORS headers for a given request.
 * Only reflects the origin back if it's in the allowlist.
 */
function getCorsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = getAllowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// --- HTTP Rate Limiting ---
// Separate rate limiter for HTTP endpoints, keyed by client IP
const httpRateLimiter = new RateLimiter({
  maxRequests: 60,       // 60 requests per minute
  windowMs: 60000,
  blockDurationMs: 60000, // block for 1 minute if exceeded
});

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
const HOST = process.env.HOST || '0.0.0.0';
const PLAYERS_PER_MATCH = parseInt(process.env.PLAYERS_PER_MATCH || '2', 10);
const HATHORA_TOKEN = process.env.HATHORA_TOKEN || process.env.HATHORA_DEV_TOKEN;

// Validate required env vars
if (!process.env.HATHORA_APP_ID || !HATHORA_TOKEN) {
  console.error('❌ Missing required environment variables:');
  console.error('   HATHORA_APP_ID and either HATHORA_TOKEN or HATHORA_DEV_TOKEN must be set');
  console.error('');
  console.error('   Create a .env file with:');
  console.error('   HATHORA_APP_ID=your_app_id');
  console.error('   HATHORA_TOKEN=your_token (or HATHORA_DEV_TOKEN=your_token)');
  process.exit(1);
}

const matchmaker = new Matchmaker({
  playersPerMatch: PLAYERS_PER_MATCH,
});

// Create HTTP server to handle both HTTP requests and WebSocket upgrades
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Health check endpoint (exempt from rate limiting)
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'vim-racing-matchmaking' }));
    return;
  }

  // Apply HTTP rate limiting to all non-health-check routes
  const clientIp = getClientIp(req);
  if (!httpRateLimiter.check(clientIp)) {
    res.writeHead(429, { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
    return;
  }

  // Practice session endpoint
  if (req.url === '/api/task/practice' && req.method === 'GET') {
    const session = generatePracticeSession(10);
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(session));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
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
server.listen(PORT, HOST, () => {
  matchmaker.start();
  console.log(`🚀 Matchmaking server running on http://${HOST}:${PORT}`);
  console.log(`   WebSocket: ws://${HOST}:${PORT}`);
  console.log(`   Practice API: http://${HOST}:${PORT}/api/task/practice`);
  console.log(`   Hathora App ID: configured`);
  console.log(`   Players per match: ${PLAYERS_PER_MATCH}`);
  console.log(`   Auth required: ${REQUIRE_AUTH}`);
  console.log(`   CORS origins: ${CORS_ORIGINS.join(', ')}`);
});

