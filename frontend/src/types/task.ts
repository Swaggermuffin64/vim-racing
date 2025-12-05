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
export interface DeleteTask {
  id: string;
  type: 'delete';
  description: string;
  codeSnippet: string;
  targetRange: { from: number; to: number };
  expectedResult: string;
}

export type Task = PositionTask | DeleteTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

