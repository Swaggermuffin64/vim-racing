import type { Server, Socket } from 'socket.io';
import type { 
  GameRoom, 
  Player, 
  ClientToServerEvents, 
  ServerToClientEvents,
  InterServerEvents,
  SocketData 
} from './types.js';
import { generateDeleteTasks, generatePositionTasks } from '../tasks.js';
import type { Task } from '../types.js';
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    if (temp !== undefined && result[j] !== undefined) {
      result[i] = result[j];
      result[j] = temp;
    }
  }
  return result;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId
  private io: GameServer;
  private NUM_TASKS: number = 10;
  constructor(io: GameServer) {
    this.io = io;
  }

  private generateRoomId(): string {
    // Generate a short, readable room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  createRoom(socket: GameSocket, playerName: string): GameRoom {
    const roomId = this.generateRoomId();
    const playerId = socket.id;
    
    const player: Player = {
      id: playerId,
      name: playerName,
      successIndicator: { cursorOffset: 0, editorText: ''},
      taskProgress: 0, // 0 to NUM_TASKS - 1
      isFinished: false,
    };

    const positionTasks: Task[] = generatePositionTasks(this.NUM_TASKS);
    const deleteTasks: Task[] = generateDeleteTasks(this.NUM_TASKS);
    const allTasks = shuffle([...positionTasks, ...deleteTasks]);

    const room: GameRoom = {
      id: roomId,
      players: new Map([[playerId, player]]),
      tasks: allTasks,
      state: 'waiting',
    };
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    
    // Join the socket.io room
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.data.playerName = playerName;

    console.log(`🏠 Room ${roomId} created by ${playerName}`);
    
    return room;
  }
    

  joinRoom(socket: GameSocket, roomId: string, playerName: string): GameRoom | null {
    const room = this.rooms.get(roomId);
    const playerId = socket.id;

    if (!room) {
      socket.emit('room:error', { message: 'Room not found' });
      return null;
    }

    if (room.state !== 'waiting') {
      socket.emit('room:error', { message: 'Race already in progress' });
      return null;
    }

    //currently limit of 2 players per room
    if (room.players.size >= 2) {
      socket.emit('room:error', { message: 'Room is full' });
      return null;
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      successIndicator: {cursorOffset: 0, editorText: ''},
      taskProgress: 0,
      isFinished: false,
    };

    room.players.set(playerId, player);
    this.playerRooms.set(playerId, roomId);

    // Join the socket.io room
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.data.playerName = playerName;

    console.log(`👤 ${playerName} joined room ${roomId}`);

    // Notify other players (not the player who joined)
    socket.to(roomId).emit('room:player_joined', { player });

    // If we have 2 players, start countdown
    if (room.players.size === 2) {
      this.startCountdown(roomId);
    }

    return room;
  }

  leaveRoom(socket: GameSocket): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;

    if (!roomId || !playerId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players.delete(playerId);
    this.playerRooms.delete(playerId);
    socket.leave(roomId);

    console.log(`👋 Player ${playerId} left room ${roomId}`);

    // Notify other players
    this.io.to(roomId).emit('room:player_left', { playerId });

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted (empty)`);
    } 
    else if (room.state === 'racing' || room.state === 'countdown') {
      // If race was in progress, end it
      room.state = 'finished';
      this.endRace(roomId);
    }
  }

  private startCountdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.state = 'countdown';
    room.countdownStart = Date.now();

    console.log(`⏱️ Starting countdown for room ${roomId}`);

    // Countdown: 3, 2, 1, GO!
    let seconds = 3;
    
    const countdownInterval = setInterval(() => {
      this.io.to(roomId).emit('game:countdown', { seconds });
      seconds--;

      if (seconds < 0) {
        clearInterval(countdownInterval);
        this.startRace(roomId);
      }
    }, 1000);
  }

  private startRace(roomId: string): void {
    const room = this.rooms.get(roomId); //refetch source of truth
    if (!room) return;

    room.state = 'racing';
    room.startTime = Date.now();

    // Reset all players
    room.players.forEach(player => {
      player.successIndicator.cursorOffset = 0;
      player.isFinished = false;
      player.taskProgress = 0;
      player.finishTime = 0;
    });

    console.log(`🏁 Race started in room ${roomId}`);
    this.io.to(roomId).emit('game:start', { startTime: room.startTime, initialTask: room.tasks[0]});
  }

  handleCursorMove(socket: GameSocket, offset: number): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'racing') return;
    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    const currentTask = room.tasks[player.taskProgress];
    //1. Task must exist and be navigate type
    if (!currentTask || currentTask.type !== 'navigate') return;
    player.successIndicator.cursorOffset = offset;
    //2. Check if the player is at the current task offset, if so advance player task 
    if (this.evaluateTaskCompletion(player, currentTask)) {
      this.advancePlayerTask(socket, room, player, roomId);
    }
  }

  handleEditorText(socket: GameSocket, text: string): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'racing') return;

    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    
    // Check if the current task is a delete task
    const currentTask = room.tasks[player.taskProgress];
    if (!currentTask || currentTask.type !== 'delete') return;
    
    // Update the player's editor text for validation
    player.successIndicator.editorText = text;
    console.log("TASK COMPLETETION CHECK", this.evaluateTaskCompletion(player, currentTask))

    // Check if the task is completed
    if (this.evaluateTaskCompletion(player, currentTask)) {
      this.advancePlayerTask(socket, room, player, roomId);
    } else if (text !== currentTask.codeSnippet) {
      // Text changed but doesn't match expected result - reset to original
      console.log("TEXT CHANGED BUT DOESN'T MATCH EXPECTED RESULT", text, currentTask.codeSnippet);
      socket.emit('game:validation_failed', playerId);
    }
  }

  private advancePlayerTask(socket: GameSocket, room: GameRoom, player: Player, roomId: string): void {
    const playerId = player.id;
    player.taskProgress += 1;
    
    // Reset editor text for next task
    player.successIndicator.editorText = '';
    
    // Send task progress and new task to the user
    console.log("player task progress", player.taskProgress);
    console.log("new task", room.tasks[player.taskProgress]);
    console.log("room tasks", room.tasks);
    socket.emit('game:player_finished_task', {
      playerId,
      taskProgress: player.taskProgress,
      newTask: room.tasks[player.taskProgress]
    });
    
    // Send the progress to the opponents
    this.io.to(roomId).emit('game:opponent_finished_task', {
      playerId,
      taskProgress: player.taskProgress,
    });
    
    // Check if the player has now finished all tasks
    if (player.taskProgress !== this.NUM_TASKS) {
      return;
    }
    
    player.isFinished = true;
    player.finishTime = Date.now() - (room.startTime || 0);

    const finishedCount = Array.from(room.players.values()).filter(p => p.isFinished).length;
    console.log(`🎉 ${player.name} finished in position ${finishedCount}!`);

    this.io.to(roomId).emit('game:player_finished', {
      playerId,
      time: player.finishTime,
      position: finishedCount,
    });

    // Check if all players finished
    if (this.allPlayersFinished(room)) {
      this.endRace(roomId);
    }
  }

  private evaluateTaskCompletion(player: Player, currentTask: Task): boolean {
    switch (currentTask.type) {
      case 'navigate': {
        return player.successIndicator.cursorOffset === currentTask.targetOffset;
      }

      case 'delete': {
        console.log(player.successIndicator.editorText, "Player text");
        console.log(currentTask.expectedResult);
        return player.successIndicator.editorText === currentTask.expectedResult;
      }

      default: {
        console.log("Task type not defined", currentTask);
        return false;
      }
    }
  }

  private allPlayersFinished(room: GameRoom): boolean {
    return Array.from(room.players.values()).every(p => p.isFinished);
  }

  private endRace(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.state = 'finished';

    // Calculate rankings
    const rankings = Array.from(room.players.values())
      .filter(p => p.isFinished)
      .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity))
      .map((player, index) => ({
        playerId: player.id,
        playerName: player.name,
        time: player.finishTime || 0,
        position: index + 1,
      }));

    // Add players who didn't finish
    room.players.forEach(player => {
      if (!player.isFinished) {
        rankings.push({
          playerId: player.id,
          playerName: player.name,
          time: 0,
          position: rankings.length + 1,
        });
      }
    });

    console.log(`🏆 Race complete in room ${roomId}:`, rankings);

    this.io.to(roomId).emit('game:complete', { rankings });
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getPlayersArray(room: GameRoom): Player[] {
    return Array.from(room.players.values());
  }
}
