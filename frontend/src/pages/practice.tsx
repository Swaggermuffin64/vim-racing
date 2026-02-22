import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Task } from '../types/task';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset } from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
  },
  raceContainer: {
    padding: '24px',
    maxWidth: '1200px',
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
  taskBannerComplete: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}60`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.success}30, inset 0 1px 0 rgba(255,255,255,0.05)`,
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
  taskHint: {
    fontSize: '13px',
    color: colors.textMuted,
    marginTop: '12px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  mainContent: {
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
  sidebar: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    minWidth: '280px',
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '12px',
  },
  progressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${colors.border}30`,
    color: colors.textSecondary,
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: colors.bgCard,
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '16px',
  },
  progressFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
    transition: 'width 0.3s ease',
    borderRadius: '4px',
  },
  toggleButton: {
    width: '100%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textSecondary,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginTop: '16px',
  },
  toggleButtonActive: {
    background: `${colors.primary}20`,
    borderColor: colors.primary,
    color: colors.primaryLight,
  },
  restartButton: {
    width: '100%',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: '16px',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
    transition: 'all 0.2s ease',
  },
  sessionComplete: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}40`,
    borderRadius: '12px',
    padding: '40px',
    boxShadow: `0 0 40px ${colors.success}20`,
  },
  completeTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: colors.successLight,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.success}60`,
  },
  completeText: {
    fontSize: '16px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '8px',
  },
  completeTime: {
    fontSize: '48px',
    fontWeight: 700,
    color: colors.success,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.success}80`,
    letterSpacing: '2px',
  },
  completeButtons: {
    display: 'flex',
    gap: '16px',
    marginTop: '32px',
  },
  completeButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.successLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 20px ${colors.success}60`,
  },
  homeButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.textSecondary,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  nextTaskHint: {
    fontSize: '14px',
    color: colors.successLight,
    marginTop: '16px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Ready screen styles
  readyWrapper: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  topBanner: {
    width: '100%',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
    position: 'relative' as const,
    zIndex: 2,
  },
  topBannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    margin: 0,
  },
  readyMainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  bgGlow1: {
    position: 'absolute' as const,
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
  },
  bgGlow2: {
    position: 'absolute' as const,
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
  },
  readyContainer: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
    textAlign: 'center' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
  readyTitle: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1px',
  },
  readySubtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '48px',
    lineHeight: 1.6,
  },
  readyCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '24px',
  },
  readyCardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  readyInfo: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.8,
  },
  readyButton: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
    marginBottom: '12px',
  },
  backButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
};

const PracticeEditor: React.FC = () => {
  const navigate = useNavigate();
  const editorRef = useRef<VimRaceEditorHandle>(null);
  const timerRef = useRef<number>(0);

  // Practice session state
  const [isReady, setIsReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskProgress, setTaskProgress] = useState(0);
  const [numTasks, setNumTasks] = useState(0);
  const [isTaskComplete, setIsTaskComplete] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [finalTime, setFinalTime] = useState(0);
  const [editorReadyTick, setEditorReadyTick] = useState(0);

  // Current task derived from state
  const currentTask = tasks[taskProgress] || null;

  // Use refs to avoid stale closures
  const tasksRef = useRef<Task[]>([]);
  const taskProgressRef = useRef(0);
  const isTaskCompleteRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    tasksRef.current = tasks;
    taskProgressRef.current = taskProgress;
    isTaskCompleteRef.current = isTaskComplete;
  }, [tasks, taskProgress, isTaskComplete]);

  // Timer effect
  useEffect(() => {
    if (sessionStartTime && !isSessionComplete) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - sessionStartTime);
      }, 100);
      timerRef.current = interval as unknown as number;
      return () => clearInterval(interval);
    }
  }, [sessionStartTime, isSessionComplete]);

  // Format time display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  // Start practice session when user clicks Ready
  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  // Setup a task in the editor (replace doc + configure highlights)
  const setupTaskInEditor = useCallback((task: Task) => {
    const view = editorRef.current?.view;
    if (!view) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: task.codeSnippet,
      },
      effects: allowReset.of(true),
    });

    if (task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(task.targetOffset),
          setDeleteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(task.targetRange),
          setDeleteMode.of(true),
          setAllowedDeleteRange.of(task.targetRange),
        ],
      });
    }
  }, []);

  // Fetch a new practice session (state only — task setup handled by effect)
  const fetchPracticeSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/task/practice`);
      const data = await response.json();

      setTasks(data.tasks);
      setNumTasks(data.numTasks);
      setTaskProgress(0);
      setIsTaskComplete(false);
      isTaskCompleteRef.current = false;
      setIsSessionComplete(false);
      setSessionStartTime(Date.now());
      setElapsedTime(0);
      setFinalTime(0);
    } catch (error) {
      console.error('Failed to fetch practice session:', error);
    }
  }, []);

  // Trigger initial fetch when user clicks Ready
  useEffect(() => {
    if (isReady) {
      fetchPracticeSession();
    }
  }, [isReady, fetchPracticeSession]);

  // Set up the first task when tasks are loaded (or reloaded on restart)
  useEffect(() => {
    if (tasks.length === 0 || taskProgress !== 0) return;
    setupTaskInEditor(tasks[0]);
    editorRef.current?.view?.focus();
  }, [tasks, taskProgress, setupTaskInEditor, editorReadyTick]);

  // Advance to next task
  const advanceToNextTask = useCallback(() => {
    const nextProgress = taskProgressRef.current + 1;

    if (nextProgress >= tasksRef.current.length) {
      setIsSessionComplete(true);
      setFinalTime(elapsedTime);
      const view = editorRef.current?.view;
      if (view) {
        view.dispatch({
          effects: [
            setTargetPosition.of(null),
            setDeleteMode.of(false),
          ],
        });
      }
      return;
    }

    setTaskProgress(nextProgress);
    setIsTaskComplete(false);
    isTaskCompleteRef.current = false;

    const nextTask = tasksRef.current[nextProgress];
    if (nextTask) {
      setupTaskInEditor(nextTask);
      editorRef.current?.view?.focus();
    }
  }, [setupTaskInEditor, elapsedTime]);

  // Handle task completion
  const handleTaskComplete = useCallback(() => {
    isTaskCompleteRef.current = true; // Set ref synchronously before blur
    setIsTaskComplete(true);

    const view = editorRef.current?.view;
    if (view) {
      view.dispatch({
        effects: [
          setTargetPosition.of(null),
          setDeleteMode.of(false),
        ],
      });
      view.contentDOM.blur();
    }
  }, []);

  // Listen for Enter key to advance when task is complete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTaskComplete && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        advanceToNextTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isTaskComplete, advanceToNextTask]);

  // Toggle relative line numbers
  const toggleRelativeLineNumbers = useCallback(() => {
    const newValue = !relativeLineNumbers;
    setRelativeLineNumbers(newValue);
    editorRef.current?.setRelativeLineNumbers(newValue);
  }, [relativeLineNumbers]);

  // Handle cursor position changes (for navigate tasks)
  const handleCursorChange = useCallback((offset: number) => {
    const currentTasks = tasksRef.current;
    const progress = taskProgressRef.current;
    const completed = isTaskCompleteRef.current;

    const task = currentTasks[progress];
    if (task && task.type === 'navigate' && !completed) {
      if (offset === task.targetOffset) {
        handleTaskComplete();
      }
    }
  }, [handleTaskComplete]);

  // Handle editor text changes (for delete tasks)
  const handleEditorChange = useCallback((newText: string) => {
    const currentTasks = tasksRef.current;
    const progress = taskProgressRef.current;
    const completed = isTaskCompleteRef.current;

    const task = currentTasks[progress];
    if (task && task.type === 'delete' && !completed) {
      if (newText === task.expectedResult) {
        handleTaskComplete();
      }
    }
  }, [handleTaskComplete]);

  const handleEditorReady = useCallback(() => {
    setEditorReadyTick((prev) => prev + 1);
  }, []);

  // Progress percentage
  const progressPercent = numTasks > 0 ? ((taskProgress + (isTaskComplete ? 1 : 0)) / numTasks) * 100 : 0;

  // Task type display
  const getTaskTypeDisplay = (task: Task | null) => {
    if (!task) return { label: 'Loading...' };
    if (task.type === 'navigate') return { label: 'Navigate to target' };
    return { label: 'Delete the highlighted text' };
  };

  const taskDisplay = getTaskTypeDisplay(currentTask);

  // Ready screen before practice starts
  if (!isReady) {
    return (
      <div style={styles.readyWrapper}>
        <div style={styles.topBanner}>
          <div style={styles.topBannerTitle}>VIM_GYM</div>
        </div>
        <div style={styles.readyMainContent}>
          <div style={styles.bgGlow1} />
          <div style={styles.bgGlow2} />
          <div style={styles.readyContainer}>
            <h1 style={styles.readyTitle}>Practice Mode</h1>
            <p style={styles.readySubtitle}>
              Hone your Vim skills with navigation and deletion challenges.
            </p>

            <div style={styles.readyCard}>
              <div style={styles.readyCardTitle}>What to expect</div>
              <div style={styles.readyInfo}>
                Navigate to highlighted targets using Vim motions<br />
                Delete highlighted text using Vim commands<br />
                Complete all tasks as fast as you can
              </div>
            </div>

            <button style={styles.readyButton} onClick={handleReady}>
              Ready
            </button>
            <button style={styles.backButton} onClick={() => navigate('/')}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.raceContainer}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>Vim Racing - Practice</div>
          <div style={styles.timer}>{formatTime(isSessionComplete ? finalTime : elapsedTime)}</div>
        </div>

        {isSessionComplete ? (
          <div style={styles.sessionComplete}>
            <div style={styles.completeTitle}>Session Complete!</div>
            <div style={styles.completeText}>You completed all {numTasks} tasks</div>
            <div style={styles.completeTime}>{formatTime(finalTime)}</div>
            <div style={styles.completeButtons}>
              <button style={styles.completeButton} onClick={fetchPracticeSession}>
                Restart
              </button>
              <button style={styles.homeButton} onClick={() => navigate('/')}>
                Home
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Task Banner */}
            <div style={isTaskComplete ? styles.taskBannerComplete : styles.taskBanner}>
              <div style={{
                ...styles.taskType,
                color: isTaskComplete ? colors.successLight : colors.primaryLight,
              }}>
                {isTaskComplete ? 'Complete!' : taskDisplay.label}
                <span style={{ color: colors.textMuted, marginLeft: '8px' }}>
                  ({taskProgress + 1}/{numTasks})
                </span>
              </div>
              <div style={styles.taskDescription}>
                {currentTask?.description || 'Loading task...'}
              </div>
              {!isTaskComplete && currentTask?.type === 'navigate' && (
                <div style={styles.taskHint}>
                  Use vim motions: <code>gg</code> <code>G</code> <code>w</code> <code>b</code> <code>f</code> <code>$</code> <code>0</code>
                </div>
              )}
              {!isTaskComplete && currentTask?.type === 'delete' && (
                <div style={styles.taskHint}>
                  Use vim delete: <code>dw</code> <code>dd</code> <code>d$</code> <code>di{'{'}</code> <code>da(</code>
                </div>
              )}
              {isTaskComplete && (
                <div style={styles.nextTaskHint}>
                  Press Enter for next task
                </div>
              )}
            </div>

            {/* Main Content */}
            <div style={styles.mainContent}>
              {/* Editor */}
              <div style={styles.editorPanel}>
                <div style={styles.editorLabel}>
                  Editor
                </div>
                <div style={styles.editorWrapper}>
                  <VimRaceEditor
                    ref={editorRef}
                    initialDoc="// Loading practice session..."
                    onReady={handleEditorReady}
                    onCursorChange={handleCursorChange}
                    onDocChange={handleEditorChange}
                    shouldAllowBlur={() => isTaskCompleteRef.current}
                  />
                </div>
              </div>

              {/* Sidebar */}
              <div style={styles.sidebar}>
                <div style={styles.sidebarTitle}>Progress</div>

                <div style={styles.progressRow}>
                  <span>Tasks Completed</span>
                  <span style={{ color: colors.primaryLight }}>
                    {taskProgress + (isTaskComplete ? 1 : 0)}/{numTasks}
                  </span>
                </div>

                <div style={styles.progressRow}>
                  <span>Time</span>
                  <span style={{ color: colors.warning }}>
                    {formatTime(elapsedTime)}
                  </span>
                </div>

                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
                </div>

                <button
                  style={{
                    ...styles.toggleButton,
                    ...(relativeLineNumbers ? styles.toggleButtonActive : {}),
                  }}
                  onClick={toggleRelativeLineNumbers}
                >
                  {relativeLineNumbers ? '[x] ' : '[ ] '}Relative Line Numbers
                </button>

                <button style={styles.restartButton} onClick={fetchPracticeSession}>
                  Restart Session
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PracticeEditor;
