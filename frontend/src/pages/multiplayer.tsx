import React, { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import {
  EditorView, keymap, drawSelection,
  highlightActiveLine, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { vim } from '@replit/codemirror-vim';
import { oneDark } from '@codemirror/theme-one-dark';

import { useGameSocket } from '../hooks/useGameSocket';
import { Lobby } from '../components/Lobby';
import { WaitingRoom } from '../components/WaitingRoom';
import { RaceCountdown } from '../components/RaceCountdown';
import { RaceResults } from '../components/RaceResults';
import { targetHighlightExtension, setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { cursorTracker } from '../extensions/cursorTracker';
import { readOnlyNavigation, setDeleteMode, allowReset } from '../extensions/readOnlyNavigation';

// Line numbers compartment for relative mode
const lineNumbersCompartment = new Compartment();

function createLineNumbersExtension(relative: boolean) {
  return lineNumbers({
    formatNumber: (lineNo: number, state: EditorState) => {
      if (!relative) return String(lineNo);
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;
      if (lineNo === cursorLine) return String(lineNo);
      return String(Math.abs(cursorLine - lineNo));
    },
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#0a0a0f',
  },
  raceContainer: {
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e0e0e0',
    fontFamily: '"JetBrains Mono", monospace',
  },
  timer: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#ff6b6b',
    fontFamily: '"JetBrains Mono", monospace',
  },
  taskBanner: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #0f3460',
    borderRadius: '8px',
    padding: '16px 24px',
    marginBottom: '24px',
  },
  taskType: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#ff6b6b',
    marginBottom: '8px',
  },
  taskDescription: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#e0e0e0',
    fontFamily: '"JetBrains Mono", monospace',
  },
  editorsContainer: {
    display: 'flex',
    gap: '24px',
  },
  editorPanel: {
    flex: 1,
  },
  editorLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#888',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  editorWrapper: {
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #333',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
  },
  finishedBadge: {
    background: '#00ff88',
    color: '#1a1a2e',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
  },
  opponentCursor: {
    position: 'relative' as const,
  },
  leaveButton: {
    padding: '8px 16px',
    fontSize: '14px',
    background: 'transparent',
    border: '1px solid #ff6b6b',
    borderRadius: '6px',
    color: '#ff6b6b',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },
};

const MultiplayerGame: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    gameState,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    sendCursorMove,
    sendEditorText,
    clearResetFlag,
  } = useGameSocket();

  const myEditorRef = useRef<HTMLDivElement>(null);
  const myViewRef = useRef<EditorView | null>(null);
  const timerRef = useRef<number>(0);
  const [elapsedTime, setElapsedTime] = React.useState(0);

  // Use ref to avoid stale closure in cursorTracker and document listener
  const sendCursorMoveRef = useRef(sendCursorMove);
  const sendEditorTextRef = useRef(sendEditorText);
  useEffect(() => {
    sendCursorMoveRef.current = sendCursorMove;
  }, [sendCursorMove]);
  useEffect(() => {
    sendEditorTextRef.current = sendEditorText;
  }, [sendEditorText]);

  const me = gameState.players.find(p => p.id === gameState.myPlayerId);

  // Handle cursor movement in my editor (uses ref to always get latest sendCursorMove)
  const handleCursorChange = useCallback((offset: number) => {
    sendCursorMoveRef.current(offset);
  }, []);

  // Timer effect
  useEffect(() => {
    if (gameState.roomState === 'racing' && gameState.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - gameState.startTime!);
      }, 100);
      timerRef.current = interval as unknown as number;
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [gameState.roomState, gameState.startTime]);

  // Document change listener for delete task validation
  const documentChangeListener = React.useMemo(
    () => EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newText = update.state.doc.toString();
        sendEditorTextRef.current(newText);
      }
    }),
    []
  );

  // Track the current task ID to detect task changes
  const currentTaskIdRef = useRef<string | null>(null);

  // Initialize my editor
  useEffect(() => {
    if (gameState.roomState === 'racing' && myEditorRef.current && !myViewRef.current && gameState.task.id) {
      currentTaskIdRef.current = gameState.task.id;
      
      myViewRef.current = new EditorView({
        doc: String(gameState.task.codeSnippet), // Make a copy, not a reference
        parent: myEditorRef.current,
        extensions: [
          vim(),
          cpp(),
          oneDark,
          readOnlyNavigation,
          documentChangeListener,
          ...targetHighlightExtension,
          cursorTracker(handleCursorChange),
          lineNumbersCompartment.of(createLineNumbersExtension(true)),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...searchKeymap]),
          EditorView.theme({
            '&': {
              fontSize: '14px',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            },
          }),
        ],
      });

      // Set target highlight and enable delete mode if needed
      if (gameState.task.type === 'navigate') {
        myViewRef.current.dispatch({
          effects: setTargetPosition.of(gameState.task.targetOffset),
        });
      } else if (gameState.task.type === 'delete') {
        myViewRef.current.dispatch({
          effects: [
            setTargetRange.of(gameState.task.targetRange),
            setDeleteMode.of(true),
          ],
        });
      }

      // Focus the editor
      setTimeout(() => myViewRef.current?.focus(), 100);
    }

    return () => {
      if (myViewRef.current) {
        myViewRef.current.destroy();
        myViewRef.current = null;
      }
    };
  }, [gameState.roomState, gameState.task, handleCursorChange, documentChangeListener]);

  // Handle task transitions (when a new task is received after completing one)
  useEffect(() => {
    if (!myViewRef.current || !gameState.task.id) return;
    
    // Check if this is a new task
    if (currentTaskIdRef.current === gameState.task.id) return;
    currentTaskIdRef.current = gameState.task.id;

    const view = myViewRef.current;
    const newSnippet = gameState.task.codeSnippet;

    // Replace the entire document with the new code sngetEventDataEventsippet
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newSnippet,
      },
    });

    // Set up highlights and delete mode based on task type
    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(gameState.task.targetOffset),
          setDeleteMode.of(false),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
        ],
      });
    }
  }, [gameState.task]);

  // Handle validation failure - reset editor to original text from task
  useEffect(() => {
    if (!gameState.shouldResetEditor || !myViewRef.current || !gameState.task.id) return;
    console.log("resetting editor");
    const view = myViewRef.current;

    // Replace the entire document with the original code snippet from the task
    // Use allowReset effect to bypass the readOnlyNavigation filter
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      effects: allowReset.of(true),
    });

    // Reset the target highlight based on task type
    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: setTargetPosition.of(gameState.task.targetOffset),
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: setTargetRange.of(gameState.task.targetRange),
    });
    }
    
    // Clear the reset flag
    clearResetFlag();
  }, [gameState.shouldResetEditor, gameState.task, clearResetFlag]);
  // Update opponent cursor position with yellow highlight

  // Format time display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  // Render based on game state
  if (gameState.roomState === 'idle') {
    return (
      <div style={styles.container}>
        <Lobby
          isConnected={isConnected}
          isConnecting={isConnecting}
          useHathora={import.meta.env.VITE_USE_HATHORA === 'true'}
          error={error}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
        />
      </div>
    );
  }

  if (gameState.roomState === 'waiting') {
    return (
      <div style={styles.container}>
        <WaitingRoom
          roomId={gameState.roomId!}
          players={gameState.players}
          onLeave={leaveRoom}
        />
      </div>
    );
  }

  // Racing or finished state
  return (
    <div style={styles.container}>
      {gameState.roomState === 'countdown' && gameState.countdown !== null && (
        <RaceCountdown seconds={gameState.countdown} />
      )}

      {gameState.roomState === 'finished' && gameState.rankings && (
        <RaceResults
          rankings={gameState.rankings}
          myPlayerId={gameState.myPlayerId}
          onPlayAgain={leaveRoom} // For now, just leave and rejoin
          onLeave={leaveRoom}
        />
      )}

      <div style={styles.raceContainer}>
        <div style={styles.header}>
          <div style={styles.title}>🏎️ Vim Racing</div>
          <div style={styles.timer}>{formatTime(elapsedTime)}</div>
          <button style={styles.leaveButton} onClick={leaveRoom}>
            Leave
          </button>
        </div>

        {gameState.task.id && (
          <div style={styles.taskBanner}>
            <div style={styles.taskType}>🎯 Navigate</div>
            <div style={styles.taskDescription}>{gameState.task.description}</div>
          </div>
        )}

        <div style={styles.editorsContainer}>
          {/* My Editor */}
          <div style={styles.editorPanel}>
            <div style={styles.editorLabel}>
              🏎️ You ({me?.name || 'Player'})
              {me?.isFinished && (
                <span style={styles.finishedBadge}>
                  ✓ {formatTime(me.finishTime || 0)}
                </span>
              )}
            </div>
            <div style={styles.editorWrapper}>
              <div ref={myEditorRef} />
            </div>
          </div>
 
          {/* Show all players except me (opponents) and their task progress */}
          <div style={{ color: '#e0e0e0' }}>
            <strong>Scoreboard:</strong>
            {gameState.players
              .map(opponent => (
                <div key={opponent.id}>
                  {opponent.name}: Task {opponent.taskProgress ?? 0}/{gameState.rankings ? gameState.rankings.length : 10}
                  {opponent.isFinished && (
                    <span style={styles.finishedBadge}>
                      ✓ {formatTime(opponent.finishTime || 0)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGame;

