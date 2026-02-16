import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { Server, Socket } from 'socket.io';
import { generatePositionTask, generatePositionTasks, generateDeleteTasks, checkPositionTask } from './tasks.js';
import type { PositionTask, Task, TaskResponse } from './types.js';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData 
} from './multiplayer/types.js';
import { RoomManager } from './multiplayer/roomManager.js';
import { IS_HATHORA, BACKEND_PORT, CORS_ORIGINS } from './config.js';
import { verifyHathoraToken, extractTokenFromHandshake } from './auth/hathoraAuth.js';
import { socketRateLimiter } from './rateLimit/socketRateLimiter.js';
import { connectionLimiter } from './rateLimit/connectionLimiter.js';
import { 
  validatePlayerName, 
  validateRoomId, 
  validateOptionalRoomId,
  validateCursorOffset, 
  validateEditorText,
  validateBoolean 
} from './validation/inputValidation.js';

// Create Fastify with its own server
const fastify = Fastify({
  logger: true
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: CORS_ORIGINS,
});

// HTTP rate limiting
await fastify.register(fastifyRateLimit, {
  max: 100,           // 100 requests
  timeWindow: '1 minute',
  // Skip rate limiting for health check
  allowList: (req: { url?: string }) => req.url === '/',
});

// Store active tasks (in production, use Redis/DB)
const activeTasks = new Map<string, PositionTask>();

// Shuffle array helper
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j] as T;
    result[j] = temp as T;
  }
  return result;
}

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
  
  // Validate taskId format (should be a UUID-like string)
  if (typeof taskId !== 'string' || taskId.length < 1 || taskId.length > 100) {
    return { success: false, error: 'Invalid task ID' };
  }
  
  // Validate cursor offset
  const offsetResult = validateCursorOffset(cursorOffset);
  if (!offsetResult.valid) {
    return { success: false, error: offsetResult.error };
  }
  
  const task = activeTasks.get(taskId);
  if (!task) {
    return { success: false, error: 'Task not found' };
  }
  
  if (task.type !== 'navigate') {
    return { success: false, error: 'Invalid task type' };
  }
  
  const isComplete = checkPositionTask(task, offsetResult.value!);
  
  if (isComplete) {
    activeTasks.delete(taskId);
  }
  
  return { 
    success: isComplete,
    targetOffset: task.targetOffset,
    cursorOffset: offsetResult.value,
  };
});

// Get a practice session (10 tasks: 5 position + 5 delete, shuffled)
fastify.get('/api/task/practice', async () => {
  const NUM_TASKS = 10;
  const tasksPerType = Math.floor(NUM_TASKS / 2);
  
  const positionTasks: Task[] = generatePositionTasks(tasksPerType);
  const deleteTasks: Task[] = generateDeleteTasks(tasksPerType);
  const allTasks = shuffle([...positionTasks, ...deleteTasks]);
  
  return {
    tasks: allTasks,
    numTasks: NUM_TASKS,
    startTime: Date.now(),
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

// Connection limit middleware - runs first
// Limits concurrent connections per IP to prevent resource exhaustion
io.use((socket, next) => {
  // Get client IP from socket handshake
  const ip = socket.handshake.headers['x-forwarded-for'] as string 
    || socket.handshake.address 
    || 'unknown';
  
  // Store IP on socket for later cleanup
  socket.data.clientIp = ip;
  
  // Check and register connection
  if (!connectionLimiter.addConnection(ip, socket.id)) {
    console.log(`🚫 Connection limit exceeded for IP ${ip} (${connectionLimiter.getConnectionCount(ip)} connections)`);
    return next(new Error('Too many connections from your IP. Please try again later.'));
  }
  
  console.log(`📊 Connection from ${ip} (${connectionLimiter.getConnectionCount(ip)}/${10} for this IP)`);
  next();
});

// Authentication middleware for Socket.IO
// Verifies Hathora auth tokens before allowing connections
io.use((socket, next) => {
  const token = extractTokenFromHandshake(socket.handshake);
  const authResult = verifyHathoraToken(token);
  
  if (!authResult.success) {
    // Remove from connection limiter since auth failed
    const ip = socket.data.clientIp || 'unknown';
    connectionLimiter.removeConnection(ip, socket.id);
    
    console.log(`🔒 Auth failed for socket ${socket.id}: ${authResult.error}`);
    return next(new Error(authResult.error || 'Authentication failed'));
  }
  
  // Store the authenticated user ID on the socket
  // userId is guaranteed to be present when success is true
  socket.data.userId = authResult.userId!;
  console.log(`🔒 Auth success: userId=${authResult.userId}`);
  next();
});

// Initialize room manager
const roomManager = new RoomManager(io);

// Helper to wrap socket event handlers with rate limiting
type SocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function rateLimitedHandler<T>(
  socket: SocketType,
  eventName: string,
  handler: (data: T) => void
): (data: T) => void {
  return (data: T) => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(`⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`);
      socket.emit('room:error', { message: 'Too many requests. Please slow down.' });
      return;
    }
    handler(data);
  };
}

// Rate limited handler for events with no data
function rateLimitedVoidHandler(
  socket: SocketType,
  eventName: string,
  handler: () => void
): () => void {
  return () => {
    const result = socketRateLimiter.check(socket.id, eventName);
    if (!result.allowed) {
      console.log(`⚠️ Rate limited ${socket.id} on ${eventName} (reset in ${result.resetIn}ms)`);
      socket.emit('room:error', { message: 'Too many requests. Please slow down.' });
      return;
    }
    handler();
  };
}

// Socket.IO connection handling
// This creates sockets when first connecting to the server,
// and also routes already created sockets to the correct handler.
// all sockets accessable via io.sockets.sockets // io.sockets.sockets.get('abc...')

io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id} (userId: ${socket.data.userId})`);

  // Create a new room
  socket.on('room:create', rateLimitedHandler(socket, 'room:create', ({ playerName, roomId: externalRoomId, isPublic }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateOptionalRoomId(externalRoomId);
    const isPublicResult = validateBoolean(isPublic);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value;
    const safeIsPublic = isPublicResult.value!;
    
    console.log(`📥 room:create received: playerName=${safeName}, roomId=${safeRoomId}, isPublic=${safeIsPublic}`);
    const room = roomManager.createRoom(socket, safeName, safeRoomId, safeIsPublic);
    const player = room.players.get(socket.id)!;
    socket.emit('room:created', { 
      roomId: room.id, 
      player,
    });
  }));

  // Join an existing room
  socket.on('room:join', rateLimitedHandler(socket, 'room:join', ({ roomId, playerName }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateRoomId(roomId);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value!;
    
    const room = roomManager.joinRoom(socket, safeRoomId, safeName);
    if (room) {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  }));

  // Join a matched room (from matchmaking) - creates room if first player, joins if second
  socket.on('room:join_matched', rateLimitedHandler(socket, 'room:join_matched', ({ roomId, playerName }) => {
    // Validate inputs
    const nameResult = validatePlayerName(playerName);
    const roomIdResult = validateRoomId(roomId);
    
    if (!roomIdResult.valid) {
      socket.emit('room:error', { message: roomIdResult.error || 'Invalid room ID' });
      return;
    }
    
    const safeName = nameResult.value!;
    const safeRoomId = roomIdResult.value!;
    
    console.log(`📥 room:join_matched: roomId=${safeRoomId}, playerName=${safeName}`);
    
    // Check if room already exists (another matched player got here first)
    const existingRoom = roomManager.getRoom(safeRoomId);
    
    if (existingRoom) {
      // Room exists, join it
      const room = roomManager.joinRoom(socket, safeRoomId, safeName);
      if (room) {
        socket.emit('room:joined', {
          roomId: room.id,
          players: roomManager.getPlayersArray(room),
        });
      }
    } else {
      // First player to arrive - create the room with the matched roomId
      // This is a public quick-match room
      const room = roomManager.createRoom(socket, safeName, safeRoomId, true);
      const player = room.players.get(socket.id)!;
      socket.emit('room:created', { 
        roomId: room.id, 
        player,
      });
    }
  }));

  // Quick match - find or create a room automatically
  socket.on('room:quick_match', rateLimitedHandler(socket, 'room:quick_match', ({ playerName }) => {
    const startTime = performance.now();
    // Validate input
    const nameResult = validatePlayerName(playerName);
    const safeName = nameResult.value!;
    
    const { room, isNewRoom } = roomManager.findOrCreateQuickMatchRoom(socket, safeName);
    const player = room.players.get(socket.id)!;
    
    console.log(`⏱️ [quick_match] ${safeName} → ${isNewRoom ? 'created' : 'joined'} room ${room.id} (${(performance.now() - startTime).toFixed(0)}ms)`);
    
    if (isNewRoom) {
      socket.emit('room:created', { roomId: room.id, player });
    } else {
      socket.emit('room:joined', {
        roomId: room.id,
        players: roomManager.getPlayersArray(room),
      });
    }
  }));

  // Leave room
  socket.on('room:leave', rateLimitedVoidHandler(socket, 'room:leave', () => {
    roomManager.leaveRoom(socket);
  }));

  // Play again (reset room for new game)
  socket.on('player:ready_to_play', rateLimitedVoidHandler(socket, 'player:ready_to_play', () => {
    roomManager.playerReadyToPlay(socket);
  }));

  // Handle cursor movement during race
  socket.on('player:cursor', rateLimitedHandler(socket, 'player:cursor', ({ offset }) => {
    // Validate cursor offset
    const offsetResult = validateCursorOffset(offset);
    if (!offsetResult.valid) {
      // Silently ignore invalid cursor data during gameplay
      return;
    }
    roomManager.handleCursorMove(socket, offsetResult.value!);
  }));

  // Handle editor text for delete task validation
  socket.on('player:editorText', rateLimitedHandler(socket, 'player:editorText', ({ text }) => {
    // Validate editor text
    const textResult = validateEditorText(text);
    if (!textResult.valid) {
      socket.emit('room:error', { message: textResult.error || 'Invalid editor content' });
      return;
    }
    roomManager.handleEditorText(socket, textResult.value!);
  }));

  // Handle disconnect - no rate limit needed
  socket.on('disconnect', () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    socketRateLimiter.removeSocket(socket.id);
    
    // Remove from connection limiter
    const ip = socket.data.clientIp || 'unknown';
    connectionLimiter.removeConnection(ip, socket.id);
    
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
