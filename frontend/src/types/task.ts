// Task types matching backend

export type TaskType = 'navigate' | 'delete' | 'insert' | 'change';

export interface Position {
  line: number;  // 1-indexed
  col: number;   // 0-indexed
}

export interface PositionTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: Position;
  targetOffset: number;
}

export type Task = PositionTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

