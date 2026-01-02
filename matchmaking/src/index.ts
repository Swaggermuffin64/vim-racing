import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { Matchmaker } from './matchmaker.js';
import type { ClientMessage, ServerMessage, QueuedPlayer } from './types.js';

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

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (socket) => {
  const connectionId = randomUUID().slice(0, 8);
  console.log(`🔌 New connection: ${connectionId}`);

  socket.on('message', (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      handleMessage(socket, connectionId, message);
    } catch (err) {
      send(socket, { type: 'error', message: 'Invalid message format' });
    }
  });

  socket.on('close', async () => {
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
      // Remove from queue if already queued (rejoin)
      await matchmaker.removePlayerBySocket(socket);

      const playerId = randomUUID();
      const player: QueuedPlayer = {
        id: playerId,
        name: message.playerName || 'Anonymous',
        socket,
        queuedAt: Date.now(),
      };

      const position = await matchmaker.addPlayer(player);
      
      send(socket, { type: 'queue:joined', position, playerId });
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
    console.log('👋 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down...');
  matchmaker.stop();
  wss.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

// Start
matchmaker.start();
console.log(`🚀 Matchmaking server running on ws://localhost:${PORT}`);
console.log(`   Hathora App ID: ${process.env.HATHORA_APP_ID?.slice(0, 20)}...`);
console.log(`   Players per match: ${PLAYERS_PER_MATCH}`);

