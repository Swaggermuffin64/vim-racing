import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { generatePositionTask, checkPositionTask } from './tasks.js';
import type { PositionTask, TaskResponse } from './types.js';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData 
} from './multiplayer/types.js';
import { RoomManager } from './multiplayer/roomManager.js';
import { IS_HATHORA, BACKEND_PORT, CORS_ORIGINS } from './config.js';

// Create Fastify with its own server
const fastify = Fastify({
  logger: true
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: CORS_ORIGINS,
});

// Store active tasks (in production, use Redis/DB)
const activeTasks = new Map<string, PositionTask>();

// Health check
fastify.get('/', async () => {
  return { status: 'ok', service: 'vim-racing' };
});

// Get a new position task (single player)
fastify.get('/api/task/position', async (): Promise<TaskResponse> => {
  const task = generatePositionTask();
  activeTasks.set(task.id, task);
  
  return {
    task,
    startTime: Date.now(),
  };
});

// Validate task completion
fastify.post<{
  Body: { taskId: string; cursorOffset: number };
}>('/api/task/validate', async (request) => {
  const { taskId, cursorOffset } = request.body;
  
  const task = activeTasks.get(taskId);
  if (!task) {
    return { success: false, error: 'Task not found' };
  }
  
  if (task.type !== 'navigate') {
    return { success: false, error: 'Invalid task type' };
  }
  
  const isComplete = checkPositionTask(task, cursorOffset);
  
  if (isComplete) {
    activeTasks.delete(taskId);
  }
  
  return { 
    success: isComplete,
    targetOffset: task.targetOffset,
    cursorOffset,
  };
});

// Start Fastify first, then attach Socket.IO
await fastify.listen({ port: BACKEND_PORT, host: '0.0.0.0' });

// Now attach Socket.IO to the Fastify server
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(fastify.server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// Initialize room manager
const roomManager = new RoomManager(io);

// Socket.IO connection handling
// This creates sockets when first connecting to the server,
// and also routes already created sockets to the correct handler.
// all sockets accessable via io.sockets.sockets // io.sockets.sockets.get('abc...')

io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);

  // Create a new room
  socket.on('room:create', ({ playerName, roomId: externalRoomId, isPublic }) => {
    console.log(`📥 room:create received: playerName=${playerName}, roomId=${externalRoomId}, isPublic=${isPublic}`);
    const room = roomManager.createRoom(socket, playerName, externalRoomId, isPublic);
    const player = room.players.get(socket.id)!;
    socket.emit('room:created', { 
      roomId: room.id, 
      player,
    });
  });

  // Join an existing room
  socket.on('room:join', ({ roomId, playerName }) => {
    //player inputs the room id and name
    const room = roomManager.joinRoom(socket, roomId, playerName);
    if (room) {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  });

  // Join a matched room (from matchmaking) - creates room if first player, joins if second
  socket.on('room:join_matched', ({ roomId, playerName }) => {
    console.log(`📥 room:join_matched: roomId=${roomId}, playerName=${playerName}`);
    
    // Check if room already exists (another matched player got here first)
    const existingRoom = roomManager.getRoom(roomId);
    
    if (existingRoom) {
      // Room exists, join it
      const room = roomManager.joinRoom(socket, roomId, playerName);
      if (room) {
        socket.emit('room:joined', {
          roomId: room.id,
          players: roomManager.getPlayersArray(room),
        });
      }
    } else {
      // First player to arrive - create the room with the matched roomId
      // This is a public quick-match room
      const room = roomManager.createRoom(socket, playerName, roomId, true);
      const player = room.players.get(socket.id)!;
      socket.emit('room:created', { 
        roomId: room.id, 
        player,
      });
    }
  });

  // Quick match - find or create a room automatically
  socket.on('room:quick_match', ({ playerName }) => {
    const { room, isNewRoom } = roomManager.findOrCreateQuickMatchRoom(socket, playerName);
    const player = room.players.get(socket.id)!;
    
    if (isNewRoom) {
      socket.emit('room:created', { roomId: room.id, player });
    } else {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  });

  // Leave room
  socket.on('room:leave', () => {
    roomManager.leaveRoom(socket);
  });

  // Play again (reset room for new game)
  socket.on('player:ready_to_play', () => {
    roomManager.playerReadyToPlay(socket);
  });

  // Handle cursor movement during race
  socket.on('player:cursor', ({ offset }) => {
    roomManager.handleCursorMove(socket, offset);
  });

  // Handle editor text for delete task validation
  socket.on('player:editorText', ({ text }) => {
    roomManager.handleEditorText(socket, text);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    roomManager.leaveRoom(socket);
  });
});

console.log(`\n🏎️  Vim Racing BACKEND running at http://localhost:${BACKEND_PORT}`);
console.log(`🔌 WebSocket server ready`);
if (IS_HATHORA) {
  console.log(`🎮 Running in Hathora environment`);
  console.log(`   Process ID: ${process.env.HATHORA_PROCESS_ID}`);
  console.log(`   HATHORA_PORT: ${process.env.HATHORA_PORT || '(not set)'}`);
}
console.log('');

// Graceful shutdown handling (important for Hathora scaling)
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Close all socket connections
  io.disconnectSockets(true);
  
  // Close the Socket.IO server
  io.close(() => {
    console.log('Socket.IO server closed');
  });
  
  // Close Fastify
  await fastify.close();
  console.log('Server shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
