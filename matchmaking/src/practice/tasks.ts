import type { PositionTask, DeleteTask, Position, Task, IntTuple, DeleteStrategy, CodeSnippet } from './taskTypes.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const CODE_SNIPPIT_OBJECTS: CodeSnippet[] = require('./codeSnippets.json');

/**
 * Remove empty lines from a code snippet
 */
function removeEmptyLines(code: string): string {
  return code
    .split('\n')
    .filter(line => line.trim().length > 0)
    .join('\n');
}

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
 * Find interesting positions in code (not whitespace, meaningful characters)
 * Returns Position: row, col - used for navigation tasks
 */
function findInterestingPositions(code: string): Position[] {
  const lines = code.split('\n');
  const positions: Position[] = [];
  
  lines.forEach((line, lineIndex) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char !== ' ' && char !== '\t') {
        positions.push({ line: lineIndex + 1, col });
      }
    }
  });
  
  return positions;
}

/**
 * Find indices of non-whitespace characters - returns flat offsets for delete tasks
 */
function findNonWhitespaceIndices(code: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char !== ' ' && char !== '\t' && char !== '\n') {
      indices.push(i);
    }
  }
  return indices;
}

function findRandomDeleteRange(code: string): IntTuple {
  const indices = findNonWhitespaceIndices(code);
  if (indices.length < 2) return [0, 1];

  const idx1 = Math.floor(Math.random() * indices.length);
  let idx2 = Math.floor(Math.random() * indices.length);
  while (idx1 === idx2) {
    idx2 = Math.floor(Math.random() * indices.length);
  }

  const offset1 = indices[idx1]!;
  const offset2 = indices[idx2]!;
  return [Math.min(offset1, offset2), Math.max(offset1, offset2)];
}

/**
 * Generate a description for a navigation task
 */
function generateDescription(code: string, pos: Position): string {
  const lines = code.split('\n');
  const line = lines[pos.line - 1] ?? '';
  
  // Get context around the character
  const contextStart = Math.max(0, pos.col - 10);
  const contextEnd = Math.min(line.length, pos.col + 10);
  const context = line.substring(contextStart, contextEnd);
  
  return `Move cursor to the highlighted character (in: ${context.trim()}.)`;
}

let taskIdCounter = 0;

/**
 * Generate a random position task
 */
export function generatePositionTask(): PositionTask {
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippet = removeEmptyLines(CODE_SNIPPIT_OBJECTS[snippetIndex]?.code ?? CODE_SNIPPIT_OBJECTS[0]?.code!);
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
 * Filter indices to only include pairs with non-empty inner content
 */
function getValidInnerIndices(code: string, indices: IntTuple[]): IntTuple[] {
  return indices.filter(([start, end]) => {
    const innerStart = start + 1;
    const innerEnd = end - 1;
    if (innerStart >= innerEnd) return false;
    const innerContent = code.slice(innerStart, innerEnd);
    return innerContent.trim().length > 0;
  });
}

type DeleteStrategyExecutor = () => IntTuple;

export function generateDeleteTask(): DeleteTask {
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippet = removeEmptyLines(CODE_SNIPPIT_OBJECTS[snippetIndex]?.code!); 
  const snippetData = CODE_SNIPPIT_OBJECTS[snippetIndex];

  // Build available strategies based on what the snippet contains
  const strategies: Array<{ name: DeleteStrategy; execute: DeleteStrategyExecutor }> = [];

  // Word strategy (1-3 consecutive words) - always available (snippets always have words)
  if ((snippetData?.wordIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'WORD',
      execute: () => {
        const words = snippetData!.wordIndices;
        const wordCount = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 words
        const maxStartIdx = Math.max(0, words.length - wordCount);
        const startIdx = Math.floor(Math.random() * (maxStartIdx + 1));
        const endIdx = Math.min(startIdx + wordCount - 1, words.length - 1);
        
        const firstWord = words[startIdx] ?? [0, 1];
        const lastWord = words[endIdx] ?? firstWord;
        return [firstWord[0], lastWord[1]];
      }
    });
  }

  // Curly brace (da{) - only if snippet has curly braces
  if ((snippetData?.curlyBraceIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.curlyBraceIndices.length);
        return snippetData!.curlyBraceIndices[idx] ?? [0, 1];
      }
    });
  }

  // Parenthesis (da() - only if snippet has parentheses
  if ((snippetData?.parenthesisIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'PARENTHESIS',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.parenthesisIndices.length);
        return snippetData!.parenthesisIndices[idx] ?? [0, 1];
      }
    });
  }

  // Inner curly brace (di{) - only if snippet has non-empty brace pairs
  const validInnerBraces = getValidInnerIndices(snippet, snippetData?.curlyBraceIndices ?? []);
  if (validInnerBraces.length > 0) {
    strategies.push({
      name: 'INNER_CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBraces.length);
        const [start, end] = validInnerBraces[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Inner parenthesis (di() - only if snippet has non-empty paren pairs
  const validInnerParens = getValidInnerIndices(snippet, snippetData?.parenthesisIndices ?? []);
  if (validInnerParens.length > 0) {
    strategies.push({
      name: 'INNER_PARENTHESIS',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerParens.length);
        const [start, end] = validInnerParens[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Bracket (da[) - only if snippet has brackets
  if ((snippetData?.bracketIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'BRACKET',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.bracketIndices.length);
        return snippetData!.bracketIndices[idx] ?? [0, 1];
      }
    });
  }

  // Inner bracket (di[) - only if snippet has non-empty bracket pairs
  const validInnerBrackets = getValidInnerIndices(snippet, snippetData?.bracketIndices ?? []);
  if (validInnerBrackets.length > 0) {
    strategies.push({
      name: 'INNER_BRACKET',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBrackets.length);
        const [start, end] = validInnerBrackets[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Random fallback - always available
  strategies.push({
    name: 'RANDOM',
    execute: () => findRandomDeleteRange(snippet)
  });

  // Pick a random strategy
  const chosen = strategies[Math.floor(Math.random() * strategies.length)]!;
  const [from, to] = chosen.execute();

  const expectedResult = snippet.slice(0, from) + snippet.slice(to);
  return {
    id: `task-${++taskIdCounter}`,
    type: 'delete',
    description: "Delete the highlighted section exactly", 
    codeSnippet: snippet,
    targetRange: {from, to},
    expectedResult,
    strategy: chosen.name,
  }
}

export function generatePositionTasks(count: number): Task[] {
  return Array.from({ length: count }, generatePositionTask);
}

export function generateDeleteTasks(count: number): Task[] {
  return Array.from({ length: count }, generateDeleteTask);
}

// Shuffle array helper
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j] as T;
    result[j] = temp as T;
  }
  return result;
}

/**
 * Generate a practice session with mixed tasks
 */
export function generatePracticeSession(numTasks: number = 10) {
  const tasksPerType = Math.floor(numTasks / 2);
  
  const positionTasks: Task[] = generatePositionTasks(tasksPerType);
  const deleteTasks: Task[] = generateDeleteTasks(tasksPerType);
  const allTasks = shuffle([...positionTasks, ...deleteTasks]);
  
  return {
    tasks: allTasks,
    numTasks,
    startTime: Date.now(),
  };
}
