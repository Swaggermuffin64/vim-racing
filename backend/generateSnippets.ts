/**
 * Script to regenerate CODE_SNIPPITS_OBJECTS from CODE_SNIPPETS_RAW
 * 
 * Run with: npm run generate-snippets
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy of the helper functions (to avoid import issues)
type IntTuple = [number, number];

interface codeSnippet {
  code: string;
  wordIndices: IntTuple[];
}

function isLetter(char: string): boolean {
  return /^[a-zA-Z]$/.test(char);
}

function getWordIndices(code: string): IntTuple[] {
  let lead = 0;
  let lag = 0;
  let foundWord = false;
  let wordIndiceArray: IntTuple[] = [];
  
  for (lead = 0; lead < code.length; lead++) {
    let lead_char = code[lead];
    
    if (lead === code.length - 1 && foundWord) {
      let wordIndicie: IntTuple = [lag, lead + 1];
      wordIndiceArray.push(wordIndicie);
    } else if (lead_char && isLetter(lead_char) && !foundWord) {
      foundWord = true;
      lag = lead;
    } else if (lead_char && !isLetter(lead_char) && foundWord) {
      let wordIndicie: IntTuple = [lag, lead];
      wordIndiceArray.push(wordIndicie);
      foundWord = false;
    }
  }
  return wordIndiceArray;
}

function createCodeSnippetObjects(CODE_SNIPPETS: string[]): codeSnippet[] {
  let codeSnippetObjects: codeSnippet[] = [];
  for (let i = 0; i < CODE_SNIPPETS.length; i++) {
    let code_snippet = CODE_SNIPPETS[i];
    if (code_snippet) {
      let wordIndices = getWordIndices(code_snippet);
      let code_object: codeSnippet = {
        code: code_snippet,
        wordIndices: wordIndices
      };
      codeSnippetObjects.push(code_object);
    }
  }
  return codeSnippetObjects;
}

// Format a codeSnippet object as TypeScript code
function formatCodeSnippetObject(snippet: codeSnippet): string {
  // Convert the code string to a readable format with \n
  const codeLines = snippet.code.split('\n');
  let codeStr: string;
  
  if (codeLines.length === 1) {
    codeStr = `'${codeLines[0]?.replace(/'/g, "\\'")}'`;
  } else {
    codeStr = codeLines
      .map((line, i) => {
        const escapedLine = line.replace(/'/g, "\\'");
        if (i === 0) return `'${escapedLine}\\n'`;
        if (i === codeLines.length - 1) return `      '${escapedLine}'`;
        return `      '${escapedLine}\\n'`;
      })
      .join(' +\n');
  }

  // Format wordIndices with proper commas
  const indicesStr = formatWordIndices(snippet.wordIndices);

  return `{
    code: ${codeStr},
    wordIndices: ${indicesStr}
  }`;
}

function formatWordIndices(indices: IntTuple[]): string {
  if (indices.length === 0) return '[]';
  
  // Format each tuple and join with commas
  const formatted = indices.map(([a, b]) => `[${a}, ${b}]`);
  
  // Group into rows of 4 for readability
  const rows: string[] = [];
  const itemsPerRow = 4;
  
  for (let i = 0; i < formatted.length; i += itemsPerRow) {
    const rowItems = formatted.slice(i, i + itemsPerRow);
    rows.push(rowItems.join(', '));
  }
  
  return '[\n      ' + rows.join(',\n      ') + '\n    ]';
}

// Extract raw snippets by parsing the file as text
function extractRawSnippets(fileContent: string): string[] {
  // Find where CODE_SNIPPETS_RAW starts
  const startMarker = 'export const CODE_SNIPPETS_RAW: string[] = [';
  const startIdx = fileContent.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('Could not find CODE_SNIPPETS_RAW in file');
  }
  
  // Find the closing ]; by tracking backticks (we're only inside array when not in a string)
  let inString = false;
  let arrayEnd = -1;
  for (let i = startIdx + startMarker.length; i < fileContent.length; i++) {
    const char = fileContent[i];
    if (char === '`') {
      inString = !inString;
    } else if (!inString && char === ']' && fileContent[i + 1] === ';') {
      arrayEnd = i;
      break;
    }
  }
  
  if (arrayEnd === -1) {
    throw new Error('Could not find end of CODE_SNIPPETS_RAW array');
  }
  
  const arrayContent = fileContent.substring(startIdx + startMarker.length, arrayEnd);
  
  // Extract template literals (backtick strings)
  const snippets: string[] = [];
  let i = 0;
  while (i < arrayContent.length) {
    // Find next backtick
    const backtickStart = arrayContent.indexOf('`', i);
    if (backtickStart === -1) break;
    
    // Find closing backtick
    const backtickEnd = arrayContent.indexOf('`', backtickStart + 1);
    if (backtickEnd === -1) break;
    
    const snippet = arrayContent.substring(backtickStart + 1, backtickEnd);
    snippets.push(snippet);
    i = backtickEnd + 1;
  }
  
  return snippets;
}

async function main() {
  const codeSnippetsPath = path.join(__dirname, 'codeSnippets.ts');
  
  // Read the current file
  const fileContent = fs.readFileSync(codeSnippetsPath, 'utf-8');
  
  // Extract raw snippets by parsing text (no import needed)
  const rawSnippets = extractRawSnippets(fileContent);
  console.log(`Found ${rawSnippets.length} raw snippets`);
  
  // Generate the computed objects
  const computedObjects = createCodeSnippetObjects(rawSnippets);
  console.log('Generated computed objects with word indices');
  
  // Format as TypeScript
  const objectsStr = computedObjects
    .map(formatCodeSnippetObject)
    .join(',\n  ');
  
  const newObjectsSection = `export const CODE_SNIPPITS_OBJECTS: codeSnippet[] = [${objectsStr}]`;
  
  // Find where CODE_SNIPPITS_OBJECTS starts and replace everything after
  const objectsStart = fileContent.indexOf('export const CODE_SNIPPITS_OBJECTS');
  
  let newContent: string;
  if (objectsStart === -1) {
    // Append if not found
    newContent = fileContent.trimEnd() + '\n\n' + newObjectsSection + '\n';
  } else {
    // Replace from that point
    newContent = fileContent.substring(0, objectsStart) + newObjectsSection + '\n';
  }
  
  // Write back
  fs.writeFileSync(codeSnippetsPath, newContent);
  
  console.log('✅ Successfully updated CODE_SNIPPITS_OBJECTS in codeSnippets.ts');
}

main().catch(console.error);
