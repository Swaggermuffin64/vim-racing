import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { EditorState, Transaction } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, drawSelection, Decoration } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';

import { Task } from '../types/task';
import type { KeystrokeEvent, TaskKeystrokeSubmission } from '../types/keystroke';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset, setUndoBarrier } from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface TaskSummary {
  taskIndex: number;
  taskId: string;
  taskType: Task['type'];
  durationMs: number;
  keyCount: number;
  keySequence: string;
  codePreview: string;
  highlightFrom: number | null;
  highlightTo: number | null;
}

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
  exitButton: {
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
  },
  sidebarColumn: {
    minWidth: '280px',
  },
  sidebarControls: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
  },
  keyLogContainer: {
    marginTop: '16px',
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '14px',
  },
  keyLogTitle: {
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '10px',
  },
  keyLogBox: {
    minHeight: '64px',
    maxHeight: '120px',
    overflowY: 'auto' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    background: colors.bgCard,
    padding: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  keyLogEmpty: {
    color: colors.textMuted,
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
    width: '90%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}60`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginTop: '12px',
  },
  restartButton: {
    width: '90%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}60`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: '12px',
    transition: 'all 0.2s ease',
  },
  restartSameButton: {
    width: '90%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.secondaryLight,
    background: `${colors.secondary}12`,
    border: `1px solid ${colors.secondary}55`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: '12px',
    transition: 'all 0.2s ease',
  },
  resetTaskButton: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.secondary,
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginLeft: 'auto',
  },
  sessionComplete: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minHeight: 'calc(100vh - 180px)',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '48px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  completeTitle: {
    fontSize: '38px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  completeText: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '8px',
  },
  completeTime: {
    fontSize: '48px',
    fontWeight: 700,
    color: colors.primaryLight,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.primaryGlow}`,
    letterSpacing: '2px',
  },
  completeButtons: {
    display: 'flex',
    gap: '16px',
    marginTop: '32px',
  },
  summaryOverview: {
    width: '100%',
    marginTop: '22px',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    background: colors.bgCard,
    padding: '16px 18px',
  },
  summaryOverviewLabelRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '8px',
  },
  summaryOverviewValueRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '8px',
  },
  summaryOverviewLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  summaryOverviewValue: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
  },
  completeButton: {
    padding: '14px 32px',
    fontSize: '18px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  summaryList: {
    width: '100%',
    marginTop: '24px',
    borderTop: `1px solid ${colors.border}90`,
    paddingTop: '16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
  },
  summaryItem: {
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '10px',
    padding: '18px',
    boxShadow: `0 6px 20px rgba(0, 0, 0, 0.25)`,
  },
  summaryItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  summaryItemTitle: {
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
  },
  summaryTaskBadge: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    padding: '7px 13px',
    borderRadius: '999px',
    border: `1px solid ${colors.primary}40`,
    background: `${colors.primary}20`,
    color: colors.primaryLight,
  },
  summaryTaskType: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '15px',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  summaryMetaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '8px',
  },
  summaryMetaCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '8px',
    padding: '8px 10px',
  },
  summaryMetaCardApm: {
    borderColor: `${colors.primary}60`,
    background: `${colors.primary}16`,
  },
  summaryMetaCardDuration: {
    borderColor: `${colors.secondary}60`,
    background: `${colors.secondary}16`,
  },
  summaryMetaCardKeys: {
    borderColor: `${colors.warning}60`,
    background: `${colors.warning}16`,
  },
  summaryMetaLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
  },
  summaryMetaValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '20px',
    fontWeight: 700,
  },
  summaryKeys: {
    border: '1px solid rgba(255, 255, 255, 0.35)',
    background: '#000000',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
  },
  summaryKeysLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  summaryKeysValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '22px',
    lineHeight: 1.55,
    fontWeight: 700,
  },
  summaryEmpty: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
  },
  summaryCodeLabel: {
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
    marginTop: '8px',
    marginBottom: '6px',
  },
  summaryCodeBox: {
    background: '#282c34',
    border: '1px solid #3e4451',
    borderRadius: '8px',
    overflowX: 'auto' as const,
  },
  summaryCodeRow: {
    display: 'flex',
    alignItems: 'stretch',
  },
  summaryCodeLineNo: {
    width: '36px',
    color: '#5c6370',
    background: '#21252b',
    borderRight: '1px solid #3e4451',
    padding: '2px 6px',
    textAlign: 'right' as const,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    userSelect: 'none' as const,
  },
  summaryCodeLineText: {
    flex: 1,
    color: '#abb2bf',
    padding: '2px 8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    lineHeight: 1.4,
    whiteSpace: 'pre' as const,
    overflow: 'hidden',
  },
  summaryHighlightNavigate: {
    backgroundColor: 'rgba(6, 182, 212, 0.35)',
    outline: '1px solid #06b6d4',
  },
  summaryHighlightDelete: {
    backgroundColor: 'rgba(236, 72, 153, 0.35)',
    outline: '1px solid #ec4899',
  },
  summaryTokenKeyword: {
    color: '#c678dd',
  },
  summaryTokenType: {
    color: '#e5c07b',
  },
  summaryTokenString: {
    color: '#98c379',
  },
  summaryTokenNumber: {
    color: '#d19a66',
  },
  summaryTokenComment: {
    color: '#5c6370',
  },
  summaryTokenFunction: {
    color: '#61afef',
  },
  homeButton: {
    padding: '14px 32px',
    fontSize: '18px',
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

const setSnippetHighlight = StateEffect.define<{ from: number; to: number; taskType: Task['type'] } | null>();

const snippetHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setSnippetHighlight)) continue;
      if (!effect.value) return Decoration.none;
      const { from, to, taskType } = effect.value;
      const clampedFrom = Math.max(0, from);
      const clampedTo = Math.max(clampedFrom, to);
      if (clampedTo <= clampedFrom) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      builder.add(
        clampedFrom,
        clampedTo,
        Decoration.mark({
          class: taskType === 'delete' ? 'cm-summary-delete-highlight' : 'cm-summary-navigate-highlight',
        }),
      );
      return builder.finish();
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const SummarySnippetEditor: React.FC<{
  code: string;
  taskType: Task['type'];
  highlightFrom: number | null;
  highlightTo: number | null;
}> = ({ code, taskType, highlightFrom, highlightTo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const hasHighlight = highlightFrom !== null && highlightTo !== null && highlightTo > highlightFrom;
    const selection = hasHighlight
      ? { anchor: highlightFrom, head: highlightTo }
      : { anchor: 0 };

    const initialState = EditorState.create({
      doc: code,
      selection,
      extensions: [
        cpp(),
        oneDark,
        drawSelection(),
        snippetHighlightField,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.theme({
          '&': {
            fontSize: '15px',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            backgroundColor: '#282c34',
          },
          '.cm-scroller': {
            overflowX: 'auto',
          },
          '.cm-content': {
            padding: '8px 10px',
          },
          '.cm-gutters': {
            backgroundColor: '#21252b',
            borderRight: '1px solid #3e4451',
            color: '#5c6370',
          },
          '.cm-lineNumbers .cm-gutterElement': {
            color: '#5c6370',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-summary-navigate-highlight': {
            backgroundColor: 'rgba(6, 182, 212, 0.35)',
            outline: '1px solid #06b6d4',
          },
          '.cm-summary-delete-highlight': {
            backgroundColor: 'rgba(236, 72, 153, 0.35)',
            outline: '1px solid #ec4899',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'transparent !important',
          },
        }),
      ],
    });

    const view = new EditorView({
      state: initialState,
      parent: containerRef.current,
    });
    viewRef.current = view;

    if (hasHighlight) {
      view.dispatch({
        effects: setSnippetHighlight.of({
          from: highlightFrom,
          to: highlightTo,
          taskType,
        }),
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [code, taskType, highlightFrom, highlightTo]);

  return <div ref={containerRef} />;
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
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<TaskSummary[]>([]);

  // Current task derived from state
  const currentTask = tasks[taskProgress] || null;

  // Use refs to avoid stale closures
  const tasksRef = useRef<Task[]>([]);
  const taskProgressRef = useRef(0);
  const isTaskCompleteRef = useRef(false);
  const currentTaskIdRef = useRef<string | null>(null);
  const taskStartedAtRef = useRef<number>(Date.now());
  const taskKeystrokesRef = useRef<KeystrokeEvent[]>([]);
  const submittedTaskIdsRef = useRef<Set<string>>(new Set());

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

  const formatKeyLabel = useCallback((key: string): string | null => {
    if (key === ' ') return 'Space';
    if (key === 'Escape') return 'Esc';
    if (key === 'ArrowLeft') return 'Left';
    if (key === 'ArrowRight') return 'Right';
    if (key === 'ArrowUp') return 'Up';
    if (key === 'ArrowDown') return 'Down';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Meta') return null;
    if (key === 'Alt') return 'Alt';
    if (key === 'Shift') return 'Shift';
    return key;
  }, []);

  const formatTaskTypeLabel = useCallback((taskType: Task['type']): string => {
    if (taskType === 'navigate') return 'Navigate';
    if (taskType === 'delete') return 'Delete';
    if (taskType === 'insert') return 'Insert';
    return 'Change';
  }, []);

  const getTaskHighlightRange = useCallback((task: Task): { from: number | null; to: number | null } => {
    if (task.type === 'navigate') {
      return { from: task.targetOffset, to: task.targetOffset + 1 };
    }
    if (task.type === 'delete') {
      return { from: task.targetRange.from, to: task.targetRange.to };
    }
    return { from: null, to: null };
  }, []);

  const submitTaskKeystrokes = useCallback(async (
    task: Task,
    snapshot?: { startedAt: number; completedAt: number; events: KeystrokeEvent[] }
  ) => {
    if (submittedTaskIdsRef.current.has(task.id)) return;

    const startedAt = snapshot?.startedAt ?? taskStartedAtRef.current;
    const completedAt = snapshot?.completedAt ?? Date.now();
    const events = snapshot?.events ?? taskKeystrokesRef.current;

    const payload: TaskKeystrokeSubmission = {
      source: 'practice',
      taskId: task.id,
      taskType: task.type,
      startedAt,
      completedAt,
      events,
    };

    submittedTaskIdsRef.current.add(task.id);

    try {
      await fetch(`${API_BASE}/api/task/keystrokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to submit task keystrokes:', error);
    }
  }, []);

  const handleTaskKeyStroke = useCallback((event: KeystrokeEvent) => {
    const currentTaskId = currentTaskIdRef.current;
    if (!currentTaskId || isTaskCompleteRef.current || isSessionComplete) return;

    const dtMs = Math.max(0, Date.now() - taskStartedAtRef.current);
    taskKeystrokesRef.current.push({
      ...event,
      dtMs,
    });
    const keyLabel = formatKeyLabel(event.key);
    if (keyLabel) {
      setRecentKeys((prev) => [...prev, keyLabel].slice(-40));
    }
  }, [formatKeyLabel, isSessionComplete]);

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
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });

    // Reset search highlights between tasks so `/`, `*`, and `#`
    // don't carry visual state into the next snippet.
    const cm = getCM(view);
    if (cm?.state?.vim) {
      Vim.handleEx(cm as CodeMirrorV, 'nohlsearch');
    }

    currentTaskIdRef.current = task.id;
    taskStartedAtRef.current = Date.now();
    taskKeystrokesRef.current = [];
    setRecentKeys([]);

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

  const resetPracticeRunState = useCallback(() => {
    setTaskProgress(0);
    setIsTaskComplete(false);
    isTaskCompleteRef.current = false;
    setIsSessionComplete(false);
    setSessionStartTime(Date.now());
    setElapsedTime(0);
    setFinalTime(0);
    currentTaskIdRef.current = null;
    taskKeystrokesRef.current = [];
    submittedTaskIdsRef.current.clear();
    setRecentKeys([]);
    setTaskSummaries([]);
  }, []);

  // Fetch a new practice session (state only — task setup handled by effect)
  const fetchPracticeSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/task/practice`);
      const data = await response.json();

      setTasks(data.tasks);
      setNumTasks(data.numTasks);
      resetPracticeRunState();
    } catch (error) {
      console.error('Failed to fetch practice session:', error);
    }
  }, [resetPracticeRunState]);

  const restartSameTasks = useCallback(() => {
    const sameTasks = tasksRef.current;
    if (sameTasks.length === 0) {
      void fetchPracticeSession();
      return;
    }

    setNumTasks(sameTasks.length);
    resetPracticeRunState();
    setupTaskInEditor(sameTasks[0]!);
    editorRef.current?.view?.focus();
  }, [fetchPracticeSession, resetPracticeRunState, setupTaskInEditor]);

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

    const completedTask = tasksRef.current[taskProgressRef.current];
    if (completedTask) {
      const startedAt = taskStartedAtRef.current;
      const completedAt = Date.now();
      const eventsSnapshot = [...taskKeystrokesRef.current];
      const keyLabels = eventsSnapshot
        .map((event) => formatKeyLabel(event.key))
        .filter((label): label is string => Boolean(label));
      const visibleKeyCount = 30;
      const keySequence = keyLabels.length <= visibleKeyCount
        ? keyLabels.join(' ')
        : `${keyLabels.slice(0, visibleKeyCount).join(' ')} ... (+${keyLabels.length - visibleKeyCount})`;
      const highlight = getTaskHighlightRange(completedTask);

      setTaskSummaries((prev) => [
        ...prev,
        {
          taskIndex: taskProgressRef.current + 1,
          taskId: completedTask.id,
          taskType: completedTask.type,
          durationMs: Math.max(0, completedAt - startedAt),
          keyCount: eventsSnapshot.length,
          keySequence,
          codePreview: completedTask.codeSnippet,
          highlightFrom: highlight.from,
          highlightTo: highlight.to,
        },
      ]);

      void submitTaskKeystrokes(completedTask, {
        startedAt,
        completedAt,
        events: eventsSnapshot,
      });
    }

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
  }, [formatKeyLabel, getTaskHighlightRange, submitTaskKeystrokes]);

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

  const resetCurrentTask = useCallback(() => {
    const current = tasksRef.current[taskProgressRef.current];
    if (!current) return;

    isTaskCompleteRef.current = false;
    setIsTaskComplete(false);
    editorRef.current?.resetUndoHistory();
    setupTaskInEditor(current);
    editorRef.current?.view?.focus();
  }, [setupTaskInEditor]);

  useEffect(() => {
    const handleResetHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return;
      if (!isReady || isSessionComplete || !currentTask) return;

      e.preventDefault();
      e.stopPropagation();
      resetCurrentTask();
    };

    window.addEventListener('keydown', handleResetHotkey, { capture: true });
    return () => window.removeEventListener('keydown', handleResetHotkey, { capture: true });
  }, [isReady, isSessionComplete, currentTask, resetCurrentTask]);

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
  const summaryAverages = useMemo(() => {
    const count = taskSummaries.length;
    if (count === 0) return null;

    let totalDurationMs = 0;
    let totalKeys = 0;
    let totalApm = 0;

    for (const summary of taskSummaries) {
      totalDurationMs += summary.durationMs;
      totalKeys += summary.keyCount;
      totalApm += summary.durationMs > 0 ? summary.keyCount / (summary.durationMs / 60000) : 0;
    }

    return {
      apm: Math.round(totalApm / count),
      durationMs: Math.round(totalDurationMs / count),
      keys: Math.round(totalKeys / count),
    };
  }, [taskSummaries]);

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
        {!isSessionComplete && (
          <div style={styles.header}>
            <div style={styles.title}>Vim Racing - Practice</div>
            <div style={styles.timer}>{formatTime(elapsedTime)}</div>
            <button style={styles.exitButton} onClick={() => navigate('/')}>
              Exit
            </button>
          </div>
        )}

        {isSessionComplete ? (
          <div style={styles.sessionComplete}>
            <div style={styles.completeTitle}>Practice Summary</div>
            <div style={styles.summaryOverview}>
              <div style={styles.summaryOverviewLabelRow}>
                <span style={styles.summaryOverviewLabel}>Total Time</span>
                <span style={styles.summaryOverviewLabel}>Avg APM</span>
                <span style={styles.summaryOverviewLabel}>Avg Duration</span>
                <span style={styles.summaryOverviewLabel}>Avg Keys</span>
              </div>
              <div style={styles.summaryOverviewValueRow}>
                <span style={{ ...styles.summaryOverviewValue, color: colors.primaryLight }}>{formatTime(finalTime)}</span>
                <span style={{ ...styles.summaryOverviewValue, color: colors.primaryLight }}>{summaryAverages?.apm ?? '--'}</span>
                <span style={{ ...styles.summaryOverviewValue, color: colors.secondaryLight }}>
                  {summaryAverages ? formatTime(summaryAverages.durationMs) : '--'}
                </span>
                <span style={{ ...styles.summaryOverviewValue, color: colors.warning }}>
                  {summaryAverages?.keys ?? '--'}
                </span>
              </div>
            </div>
            <div style={styles.completeButtons}>
              <button style={styles.completeButton} onClick={restartSameTasks}>
                Restart Same Tasks
              </button>
              <button style={styles.homeButton} onClick={fetchPracticeSession}>
                New Tasks
              </button>
              <button style={styles.homeButton} onClick={() => navigate('/')}>
                Home
              </button>
            </div>
            <div style={styles.summaryList}>
              {taskSummaries.length === 0 && (
                <div style={{ ...styles.summaryEmpty, gridColumn: '1 / -1' }}>No task details recorded for this run.</div>
              )}
              {taskSummaries.map((summary) => {
                const keysPerSecond = summary.durationMs > 0
                  ? (summary.keyCount / (summary.durationMs / 1000)).toFixed(2)
                  : '0.00';
                const isDeleteTask = summary.taskType === 'delete';
                const badgeStyle: React.CSSProperties = {
                  ...styles.summaryTaskBadge,
                  border: `1px solid ${isDeleteTask ? colors.secondary : colors.primary}40`,
                  background: `${isDeleteTask ? colors.secondary : colors.primary}20`,
                  color: isDeleteTask ? colors.secondaryLight : colors.primaryLight,
                };
                return (
                  <div key={summary.taskId} style={styles.summaryItem}>
                    <div style={styles.summaryItemHeader}>
                      <span style={styles.summaryItemTitle}>Task {summary.taskIndex}</span>
                      <span style={badgeStyle}>{formatTaskTypeLabel(summary.taskType)}</span>
                    </div>
                    <div style={styles.summaryMetaRow}>
                      <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardApm }}>
                        <span style={styles.summaryMetaLabel}>Keys/s</span>
                        <span style={styles.summaryMetaValue}>{keysPerSecond}</span>
                      </div>
                      <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardDuration }}>
                        <span style={styles.summaryMetaLabel}>Duration</span>
                        <span style={styles.summaryMetaValue}>{formatTime(summary.durationMs)}</span>
                      </div>
                      <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardKeys }}>
                        <span style={styles.summaryMetaLabel}>Keys</span>
                        <span style={styles.summaryMetaValue}>{summary.keyCount}</span>
                      </div>
                    </div>
                    <div style={styles.summaryKeys}>
                      <div style={styles.summaryKeysLabel}>Key Sequence</div>
                      <div style={styles.summaryKeysValue}>{summary.keySequence || 'No key events recorded'}</div>
                    </div>
                    <div style={styles.summaryCodeLabel}>Snippet</div>
                    <div style={styles.summaryCodeBox}>
                      <SummarySnippetEditor
                        code={summary.codePreview}
                        taskType={summary.taskType}
                        highlightFrom={summary.highlightFrom}
                        highlightTo={summary.highlightTo}
                      />
                    </div>
                  </div>
                );
              })}
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
                  {currentTask && (
                    <button
                      style={styles.resetTaskButton}
                      onClick={resetCurrentTask}
                    >
                      Reset (F6)
                    </button>
                  )}
                </div>
                <div style={styles.editorWrapper}>
                  <VimRaceEditor
                    ref={editorRef}
                    initialDoc="// Loading practice session..."
                    onReady={handleEditorReady}
                    onCursorChange={handleCursorChange}
                    onDocChange={handleEditorChange}
                    onKeyStroke={handleTaskKeyStroke}
                    shouldAllowBlur={() => isTaskCompleteRef.current}
                  />
                </div>
              </div>

              {/* Sidebar */}
              <div style={styles.sidebarColumn}>
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

                  <div style={styles.keyLogContainer}>
                    <div style={styles.keyLogTitle}>Keys Pressed (Current Task)</div>
                    <div style={styles.keyLogBox}>
                      {recentKeys.length > 0
                        ? recentKeys.join(' ')
                        : <span style={styles.keyLogEmpty}>No keys yet...</span>}
                    </div>
                  </div>
                </div>

                <div style={styles.sidebarControls}>
                  <button
                    style={styles.toggleButton}
                    onClick={toggleRelativeLineNumbers}
                  >
                    {relativeLineNumbers ? '[x] ' : '[ ] '}Relative Line Numbers
                  </button>

                  <button style={styles.restartButton} onClick={fetchPracticeSession}>
                    Restart with New Tasks
                  </button>

                  <button style={styles.restartSameButton} onClick={restartSameTasks}>
                    Restart Same Tasks
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PracticeEditor;
