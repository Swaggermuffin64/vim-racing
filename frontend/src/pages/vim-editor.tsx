import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Compartment } from "@codemirror/state"
import { cpp } from "@codemirror/lang-cpp"
import {
  EditorView, keymap, drawSelection,
  highlightActiveLine, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view"
import { defaultKeymap } from "@codemirror/commands"
import { searchKeymap } from "@codemirror/search"
import { vim } from '@replit/codemirror-vim'
import { oneDark } from '@codemirror/theme-one-dark'

import { Task } from '../types/task';
import { targetHighlightExtension, setTargetPosition } from '../extensions/targetHighlight';
import { cursorTracker } from '../extensions/cursorTracker';
import { readOnlyNavigation } from '../extensions/readOnlyNavigation';
import { TaskBanner } from '../components/TaskBanner';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Compartment for reconfigurable line numbers
const lineNumbersCompartment = new Compartment();

// Create line numbers config based on relative mode
function createLineNumbersExtension(relative: boolean) {
  return lineNumbers({
    formatNumber: (lineNo: number, state: EditorState) => {
      if (!relative) {
        return String(lineNo);
      }
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;
      if (lineNo === cursorLine) {
        return String(lineNo); // Show absolute for current line
      }
      return String(Math.abs(cursorLine - lineNo));
    },
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 32px',
    minHeight: '100vh',
    background: '#0a0a0f',
    boxSizing: 'border-box' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#e0e0e0',
    marginBottom: '24px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  },
  editorContainer: {
    width: '50%',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #333',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  toggleButton: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#e0e0e0',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    transition: 'all 0.2s ease',
  },
  toggleButtonActive: {
    background: '#0f3460',
    borderColor: '#ff6b6b',
    color: '#ff6b6b',
  },
};

const VimEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  const [task, setTask] = useState<Task | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(true);
  
  // Use refs to avoid stale closures in the cursor tracker
  const taskRef = useRef<Task | null>(null);
  const isCompleteRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    taskRef.current = task;
    isCompleteRef.current = isComplete;
  }, [task, isComplete]);

  // Fetch a new task from the backend
  const fetchTask = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/task/position`);
      const data = await response.json();
      setTask(data.task);
      setIsComplete(false);
      
      // Update editor content and highlight
      if (viewRef.current && data.task) {
        const newDoc = data.task.codeSnippet;
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: newDoc,
          },
          effects: setTargetPosition.of(data.task.targetOffset),
        });
        
        // Focus the editor for the new task
        viewRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to fetch task:', error);
    }
  }, []);

  // Listen for Enter key to start next task when complete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComplete && e.key === 'Enter') {
        e.preventDefault();
        fetchTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isComplete, fetchTask]);

  // Toggle relative line numbers
  const toggleRelativeLineNumbers = useCallback(() => {
    const newValue = !relativeLineNumbers;
    setRelativeLineNumbers(newValue);
    
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: lineNumbersCompartment.reconfigure(createLineNumbersExtension(newValue)),
      });
    }
  }, [relativeLineNumbers]);

  // Handle cursor position changes (uses refs to avoid stale closures)
  const handleCursorChange = useCallback((offset: number) => {
    const currentTask = taskRef.current;
    const completed = isCompleteRef.current;
    
    if (currentTask && currentTask.type === 'navigate' && !completed) {
      if (offset === currentTask.targetOffset) {
        setIsComplete(true);
        // Clear the highlight and blur editor
        if (viewRef.current) {
          viewRef.current.dispatch({
            effects: setTargetPosition.of(null),
          });
          viewRef.current.contentDOM.blur();
        }
      }
    }
  }, []);

  // Initialize editor
  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      viewRef.current = new EditorView({
        doc: "// Loading task...",
        parent: editorRef.current,
        extensions: [
          vim(),
          cpp(),
          oneDark,
          readOnlyNavigation,
          ...targetHighlightExtension,
          cursorTracker(handleCursorChange),
          lineNumbersCompartment.of(createLineNumbersExtension(true)),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([
            ...defaultKeymap,
            ...searchKeymap,  // Keep for Vim's / search
          ]),
          // Custom editor styling
          EditorView.theme({
            '&': {
              fontSize: '15px',
              fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
            },
            '.cm-content': {
              padding: '16px 0',
            },
            '.cm-gutters': {
              paddingLeft: '8px',
            },
          }),
        ]
      });

      // Fetch initial task
      fetchTask();
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [fetchTask, handleCursorChange]);


  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⌨️ Vim Racing</h1>
      
      <TaskBanner 
        task={task} 
        isComplete={isComplete} 
        onNextTask={fetchTask} 
      />

      <div style={styles.toolbar}>
        <button
          style={{
            ...styles.toggleButton,
            ...(relativeLineNumbers ? styles.toggleButtonActive : {}),
          }}
          onClick={toggleRelativeLineNumbers}
        >
          {relativeLineNumbers ? '✓ Relative Lines' : 'Relative Lines'}
        </button>
      </div>
      
      <div style={styles.editorContainer}>
        <div ref={editorRef} />
      </div>
    </div>
  );
};

export default VimEditor;
