// Shared task types for vim racing

export type TaskType = 'navigate' | 'delete' | 'insert' | 'change';

export interface Position {
  line: number;  // 1-indexed line number
  col: number;   // 0-indexed column
}

export interface PositionTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: Position;
  // Character offset in the document (for CodeMirror highlighting)
  targetOffset: number;
}

// Future task types
export interface DeleteTask {
  id: string;
  type: 'delete';
  description: string;
  codeSnippet: string;
  targetRange: { from: number; to: number };
  expectedResult: string;
}

export interface ChangeTask {
  id: string;
  type: 'change';
  description: string;
  codeSnippet: string;
  targetRange: { from: number; to: number };
  newText: string;
  expectedResult: string;
}

export type Task = PositionTask | DeleteTask | ChangeTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

