// Shared multiplayer types

import type { PositionTask } from "../types.js";

export interface Player {
  id: string;
  name: string;
  cursorOffset: number;
  taskProgress: number;
  isFinished: boolean;
  finishTime?: number;
}

export interface GameRoom {
  id: string;
  players: Map<string, Player>;
  tasks: PositionTask[];
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
}

// Server → Client Events
export interface ServerToClientEvents {
  'room:created': (data: { roomId: string; player: Player; }) => void;
  'room:joined': (data: { roomId: string; players: Player[]; }) => void;
  'room:player_joined': (data: { player: Player }) => void;
  'room:player_left': (data: { playerId: string }) => void;
  'room:error': (data: { message: string }) => void;
  'game:countdown': (data: { seconds: number }) => void;
  'game:start': (data: { startTime: number, initialTask: PositionTask | undefined}) => void;
  'game:opponent_cursor': (data: { playerId: string; offset: number; }) => void;
  'game:player_finished_task': (data: { playerId: string; taskProgress: number; newTask: PositionTask | undefined}) => void;
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

