// Multiplayer types for frontend

export interface Player {
  id: string;
  name: string;
  cursorOffset: number;
  taskProgress: number;
  isFinished: boolean;
  finishTime?: number;
}

export interface GameTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: { line: number; col: number };
  targetOffset: number;
}

export interface Ranking {
  playerId: string;
  playerName: string;
  time: number;
  position: number;
}

export type RoomState = 'idle' | 'waiting' | 'countdown' | 'racing' | 'finished';

export interface GameState {
  roomId: string | null;
  roomState: RoomState;
  players: Player[];
  task: GameTask | null;
  countdown: number | null;
  startTime: number | null;
  rankings: Ranking[] | null;
  myPlayerId: string | null;
}

