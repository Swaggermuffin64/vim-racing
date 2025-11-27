import type { PositionTask, Position } from './types.js';

// Code snippets for vim racing
const CODE_SNIPPETS: string[] = [
  `int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}`,

  `void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}`,

  `int binary_search(int arr[], int size, int target) {
    int left = 0;
    int right = size - 1;

    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            return mid;
        }
        if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
}`,

  `void bubble_sort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,

  `struct Node *reverse_list(struct Node *head) {
    struct Node *prev = NULL;
    struct Node *current = head;
    struct Node *next = NULL;

    while (current != NULL) {
        next = current->next;
        current->next = prev;
        prev = current;
        current = next;
    }
    return prev;
}`,
];

/**
 * Convert line/col position to character offset
 */
function positionToOffset(code: string, pos: Position): number {
  const lines = code.split('\n');
  let offset = 0;
  
  for (let i = 0; i < pos.line - 1 && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }
  
  const targetLine = lines[pos.line - 1];
  offset += Math.min(pos.col, targetLine?.length ?? 0);
  return offset;
}

/**
 * Get the character at a position in the code
 */
function getCharAtPosition(code: string, pos: Position): string {
  const lines = code.split('\n');
  if (pos.line < 1 || pos.line > lines.length) return '';
  const line = lines[pos.line - 1];
  if (!line || pos.col < 0 || pos.col >= line.length) return '';
  return line[pos.col] ?? '';
}

/**
 * Find interesting positions in code (not whitespace, meaningful characters)
 */
function findInterestingPositions(code: string): Position[] {
  const lines = code.split('\n');
  const positions: Position[] = [];
  
  lines.forEach((line, lineIndex) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      // Skip leading whitespace, prefer meaningful characters
      if (char !== ' ' && char !== '\t') {
        positions.push({ line: lineIndex + 1, col });
      }
    }
  });
  
  return positions;
}

/**
 * Generate a description for a navigation task
 */
function generateDescription(code: string, pos: Position): string {
  const char = getCharAtPosition(code, pos);
  const lines = code.split('\n');
  const line = lines[pos.line - 1] ?? '';
  
  // Get context around the character
  const contextStart = Math.max(0, pos.col - 10);
  const contextEnd = Math.min(line.length, pos.col + 10);
  const context = line.substring(contextStart, contextEnd);
  
  return `Move cursor to "${char}" on line ${pos.line} (in: ${context.trim()})`;
}

let taskIdCounter = 0;

/**
 * Generate a random position task
 */
export function generatePositionTask(): PositionTask {
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPETS.length);
  const snippet = CODE_SNIPPETS[snippetIndex] ?? CODE_SNIPPETS[0]!;
  const positions = findInterestingPositions(snippet);
  
  // Pick a random interesting position
  const posIndex = Math.floor(Math.random() * positions.length);
  const targetPosition = positions[posIndex] ?? { line: 1, col: 0 };
  const targetOffset = positionToOffset(snippet, targetPosition);
  
  return {
    id: `task-${++taskIdCounter}`,
    type: 'navigate',
    description: generateDescription(snippet, targetPosition),
    codeSnippet: snippet,
    targetPosition,
    targetOffset,
  };
}

/**
 * Check if a cursor position matches the target
 */
export function checkPositionTask(
  task: PositionTask, 
  cursorOffset: number
): boolean {
  return cursorOffset === task.targetOffset;
}
