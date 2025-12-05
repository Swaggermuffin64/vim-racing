// Shared multiplayer types
import type { Task } from "../types.js";

export interface Player {
  id: string;
  name: string;
  taskProgress: number;
  isFinished: boolean;
  successIndicator: { cursorOffset?: number; editorText?: string };
  finishTime?: number;
}

export interface GameRoom {
  id: string;
  players: Map<string, Player>;
  tasks: Task[];
  state: 'waiting' | 'countdown' | 'racing' | 'finished';
  startTime?: number;
  countdownStart?: number;
}

// Client → Server Events
export interface ClientToServerEvents {
  'room:create': (data: { playerName: string }) => void;
  'room:join': (data: { roomId: string; playerName: string }) => void;
  'room:leave': () => void;
  'player:cursor': (data: { offset: number }) => void;
  'player:editorText': (data: { text: string }) => void;
}

// Server → Client Events
export interface ServerToClientEvents {
  'room:created': (data: { roomId: string; player: Player; }) => void;
  'room:joined': (data: { roomId: string; players: Player[]; }) => void;
  'room:player_joined': (data: { player: Player }) => void;
  'room:player_left': (data: { playerId: string }) => void;
  'room:error': (data: { message: string }) => void;
  'game:countdown': (data: { seconds: number }) => void;
  'game:start': (data: { startTime: number, initialTask: Task | undefined}) => void;
  'game:opponent_finished_task': (data: { playerId: string; taskProgress: number;}) => void;
  'game:player_finished_task': (data: { playerId: string; taskProgress: number; newTask: Task | undefined}) => void;
  'game:validation_failed': (playerId: string) => void;
  'game:player_finished': (data: { playerId: string; time: number; position: number }) => void;
  'game:complete': (data: { rankings: Array<{ playerId: string; playerName: string; time: number; position: number }> }) => void;
}

// For Socket.IO typing
export interface InterServerEvents {}

export interface SocketData {
  playerId: string;
  playerName: string;
  roomId?: string;
}

