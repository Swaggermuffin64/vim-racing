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

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

// Create Fastify with its own server
const fastify = Fastify({
  logger: true
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
  },
});

// Initialize room manager
const roomManager = new RoomManager(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);

  // Create a new room
  socket.on('room:create', ({ playerName }) => {
    const room = roomManager.createRoom(socket, playerName);
    const player = room.players.get(socket.id)!;
    
    socket.emit('room:created', { 
      roomId: room.id, 
      player,
      task: room.task,  // Include task for host
    });
  });

  // Join an existing room
  socket.on('room:join', ({ roomId, playerName }) => {
    const room = roomManager.joinRoom(socket, roomId, playerName);
    
    if (room) {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
        task: room.task,
      });
    }
  });

  // Leave room
  socket.on('room:leave', () => {
    roomManager.leaveRoom(socket);
  });

  // Handle cursor movement during race
  socket.on('player:cursor', ({ offset }) => {
    roomManager.handleCursorMove(socket, offset);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    roomManager.leaveRoom(socket);
  });
});

console.log(`\n🏎️  Vim Racing BACKEND running at http://localhost:${BACKEND_PORT}`);
console.log(`🔌 WebSocket server ready\n`);
