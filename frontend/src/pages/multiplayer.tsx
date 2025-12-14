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
import { readOnlyNavigation, setDeleteMode, setAllowedDeleteRange, allowReset } from '../extensions/readOnlyNavigation';

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

// Color palette - cohesive cyberpunk/neon theme
const colors = {
  // Base
  bgDark: '#0a0a0f',
  bgCard: '#12121a',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  
  // Primary accent (cyan/teal) - matches navigate highlight
  primary: '#06b6d4',
  primaryLight: '#22d3ee',
  primaryGlow: 'rgba(6, 182, 212, 0.3)',
  
  // Secondary accent (magenta/pink) - matches delete highlight
  secondary: '#ec4899',
  secondaryLight: '#f472b6',
  
  // Success (emerald)
  success: '#10b981',
  successLight: '#34d399',
  
  // Warning/Timer (amber)
  warning: '#fbbf24',
  warningDark: '#f59e0b',
  
  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  // Borders
  border: '#334155',
  borderLight: '#475569',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
  },
  raceContainer: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '16px 24px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  timer: {
    fontSize: '36px',
    fontWeight: 700,
    color: colors.warning,
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.warning}40`,
    letterSpacing: '2px',
  },
  taskBanner: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.primary}40`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  taskType: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    color: colors.primaryLight,
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  taskDescription: {
    fontSize: '18px',
    fontWeight: 500,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.5,
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
    color: colors.textSecondary,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  editorWrapper: {
    borderRadius: '12px',
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px ${colors.primary}40`,
  },
  finishedBadge: {
    background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.successLight} 100%)`,
    color: colors.bgDark,
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    boxShadow: `0 0 12px ${colors.success}60`,
  },
  waitingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '350px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}40`,
    borderRadius: '12px',
    padding: '40px',
    boxShadow: `0 0 40px ${colors.success}20`,
  },
  waitingTitle: {
    fontSize: '28px',
    fontWeight: 700,
    color: colors.successLight,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.success}60`,
  },
  waitingText: {
    fontSize: '16px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  waitingTime: {
    fontSize: '40px',
    fontWeight: 700,
    color: colors.success,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.success}80`,
    letterSpacing: '2px',
  },
  opponentCursor: {
    position: 'relative' as const,
  },
  leaveButton: {
    padding: '10px 20px',
    fontSize: '14px',
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    color: colors.secondary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },
  scoreboard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    minWidth: '250px',
  },
  scoreboardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '12px',
  },
  scoreboardPlayer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${colors.border}30`,
    color: colors.textSecondary,
    fontSize: '14px',
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
            '.cm-content': {
              caretColor: colors.primary,
            },
            '.cm-cursor, .cm-dropCursor': {
              borderLeftColor: colors.primary,
              borderLeftWidth: '2px',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              backgroundColor: `${colors.primary}30`,
            },
            '.cm-activeLine': {
              backgroundColor: `${colors.primary}10`,
            },
            '.cm-activeLineGutter': {
              backgroundColor: `${colors.primary}15`,
            },
            '.cm-gutters': {
              backgroundColor: colors.bgCard,
              borderRight: `1px solid ${colors.border}`,
            },
            '.cm-lineNumbers .cm-gutterElement': {
              color: colors.textMuted,
            },
            '.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter': {
              color: colors.primaryLight,
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
            setAllowedDeleteRange.of(gameState.task.targetRange),
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
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
          setAllowedDeleteRange.of(gameState.task.targetRange),
        ],
      });
    }
  }, [gameState.task]);

  // Clean up editor when player finishes
  useEffect(() => {
    if (me?.isFinished && myViewRef.current) {
      myViewRef.current.destroy();
      myViewRef.current = null;
    }
  }, [me?.isFinished]);

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
            <div style={styles.taskType}>
              {gameState.task.type === 'navigate' ? '🎯' : '✂️'}
              {gameState.task.type === 'navigate' ? 'Navigate to target' : 'Delete the highlighted text'}
            </div>
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
            {me?.isFinished ? (
              <div style={styles.waitingContainer}>
                <div style={styles.waitingTitle}>🎉 Finished!</div>
                <div style={styles.waitingText}>Waiting for other players...</div>
                <div style={styles.waitingTime}>{formatTime(me.finishTime || 0)}</div>
              </div>
            ) : (
              <div style={styles.editorWrapper}>
                <div ref={myEditorRef} />
              </div>
            )}
          </div>
 
          {/* Scoreboard */}
          <div style={styles.scoreboard}>
            <div style={styles.scoreboardTitle}>🏁 Scoreboard</div>
            {gameState.players.map(player => (
              <div 
                key={player.id} 
                style={{
                  ...styles.scoreboardPlayer,
                  color: player.id === gameState.myPlayerId ? colors.primaryLight : colors.textSecondary,
                }}
              >
                <span>
                  {player.id === gameState.myPlayerId ? '👤 ' : ''}
                  {player.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: colors.textMuted }}>
                    {player.taskProgress ?? 0}/{gameState.rankings ? gameState.rankings.length : 10}
                  </span>
                  {player.isFinished && (
                    <span style={styles.finishedBadge}>
                      ✓ {formatTime(player.finishTime || 0)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGame;

