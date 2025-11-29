import type { Server, Socket } from 'socket.io';
import type { 
  GameRoom, 
  Player, 
  ClientToServerEvents, 
  ServerToClientEvents,
  InterServerEvents,
  SocketData 
} from './types.js';
import { generatePositionTasks } from '../tasks.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

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
      cursorOffset: 0,
      taskProgress: 0, // 0 to NUM_TASKS - 1
      isFinished: false,
    };

    const tasks = generatePositionTasks(this.NUM_TASKS);
    
    const room: GameRoom = {
      id: roomId,
      players: new Map([[playerId, player]]),
      tasks: tasks,
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
      cursorOffset: 0,
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
    } else if (room.state === 'racing' || room.state === 'countdown') {
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
      player.cursorOffset = 0;
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
    console.log("check 1");
    if (!roomId || !playerId) return;
    console.log("check 2");
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'racing') return;

    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    //1. Set the currentOffset, send to other players
    console.log(player.cursorOffset, offset);
    player.cursorOffset = offset;
    //2. Check if the player is at the current task offset, if so increment the taskProgress, and send new task to the player and others
    const currentTask = room.tasks[player.taskProgress];
    if (!currentTask || currentTask.targetOffset !== offset) {
      return;
    }
    player.taskProgress+=1
    //3. Send task progress and new task to the user
    socket.emit('game:player_finished_task',{
      playerId,
      taskProgress: player.taskProgress,
      newTask: room.tasks[player.taskProgress]
    })
    //4. Send the progress to the opponents
    this.io.to(roomId).emit('game:opponent_finished_task', {
      playerId,
      taskProgress: player.taskProgress,
    })
    //5. Check if the player has now finished all tasks, if so set isFinished to true and send the final results to the player and others
    if (player.taskProgress !== this.NUM_TASKS){
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
