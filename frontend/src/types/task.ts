// Task types matching backend

export type TaskType = 'navigate' | 'delete' | 'insert' | 'change';

// Delete strategies - maps to vim commands
export type DeleteStrategy = 
  | 'WORD'              // dw, d2w, d3w
  | 'CURLY_BRACE'       // da{
  | 'INNER_CURLY_BRACE' // di{
  | 'PARENTHESIS'       // da(
  | 'INNER_PARENTHESIS' // di(
  | 'BRACKET'           // da[
  | 'INNER_BRACKET'     // di[
  | 'RANDOM';           // arbitrary range

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
  strategy: DeleteStrategy;
}

export type Task = PositionTask | DeleteTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

