import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, Compartment } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import {
  EditorView, keymap, drawSelection,
  highlightActiveLine, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { vim, Vim } from '@replit/codemirror-vim';
import { oneDark } from '@codemirror/theme-one-dark';

import { targetHighlightExtension } from '../extensions/targetHighlight';
import { cursorTracker } from '../extensions/cursorTracker';
import { readOnlyNavigation } from '../extensions/readOnlyNavigation';

// ---------------------------------------------------------------------------
// Shared color palette used across all race / practice pages
// ---------------------------------------------------------------------------
export const editorColors = {
  bgDark: '#0a0a0f',
  bgCard: '#12121a',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  primary: '#06b6d4',
  primaryLight: '#22d3ee',
  primaryGlow: 'rgba(6, 182, 212, 0.3)',
  secondary: '#ec4899',
  secondaryLight: '#f472b6',
  success: '#10b981',
  successLight: '#34d399',
  warning: '#fbbf24',
  warningDark: '#f59e0b',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  borderLight: '#475569',
};

// ---------------------------------------------------------------------------
// Editor-only extensions (shared between practice & multiplayer)
// ---------------------------------------------------------------------------

const lineNumbersCompartment = new Compartment();

// Keys that enter insert mode — blocked because tasks only need navigation/deletion.
// Mapped in normal mode only so text objects (e.g. di{, da() still work.
const INSERT_MODE_KEYS = ['i', 'I', 'a', 'A', 'o', 'O', 's', 'S', 'c', 'C', 'R'];

/** Block all mouse interaction — the editor is keyboard-only. */
const disableMouseInteraction = EditorView.domEventHandlers({
  mousedown: () => true,
  click: () => true,
  dblclick: () => true,
  contextmenu: () => true,
  selectstart: () => true,
});

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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Handle exposed to parent components via ref. */
export interface VimRaceEditorHandle {
  /** The underlying CodeMirror EditorView (null before mount). */
  view: EditorView | null;
  /** Toggle between relative and absolute line numbers. */
  setRelativeLineNumbers: (relative: boolean) => void;
}

interface VimRaceEditorProps {
  /** Initial document content shown when the editor mounts. */
  initialDoc: string;
  /** Called once after the EditorView is created. */
  onReady?: (view: EditorView) => void;
  /** Called whenever the cursor position changes. */
  onCursorChange: (offset: number) => void;
  /** Called whenever the document text changes. */
  onDocChange?: (text: string) => void;
  /**
   * Called on blur — return `true` to allow the blur (e.g. task complete),
   * `false` to auto-refocus. Defaults to never allowing blur.
   */
  shouldAllowBlur?: () => boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VimRaceEditor = forwardRef<VimRaceEditorHandle, VimRaceEditorProps>(
  ({ initialDoc, onReady, onCursorChange, onDocChange, shouldAllowBlur }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Refs for callbacks so CodeMirror extensions never hold stale closures.
    const onCursorChangeRef = useRef(onCursorChange);
    const onDocChangeRef = useRef(onDocChange);
    const shouldAllowBlurRef = useRef(shouldAllowBlur);

    useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);
    useEffect(() => { onDocChangeRef.current = onDocChange; }, [onDocChange]);
    useEffect(() => { shouldAllowBlurRef.current = shouldAllowBlur; }, [shouldAllowBlur]);

    useImperativeHandle(ref, () => ({
      get view() { return viewRef.current; },
      setRelativeLineNumbers(relative: boolean) {
        viewRef.current?.dispatch({
          effects: lineNumbersCompartment.reconfigure(
            createLineNumbersExtension(relative),
          ),
        });
      },
    }));

    // Create editor on mount, destroy on unmount.
    useEffect(() => {
      if (!containerRef.current) return;

      const docChangeListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onDocChangeRef.current?.(update.state.doc.toString());
        }
      });

      const view = new EditorView({
        doc: initialDoc,
        parent: containerRef.current,
        extensions: [
          vim(),
          cpp(),
          oneDark,
          readOnlyNavigation,
          docChangeListener,
          ...targetHighlightExtension,
          cursorTracker((offset) => onCursorChangeRef.current(offset)),
          lineNumbersCompartment.of(createLineNumbersExtension(true)),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          disableMouseInteraction,
          keymap.of([...defaultKeymap, ...searchKeymap]),
          EditorView.theme({
            '&': {
              fontSize: '14px',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            },
            '.cm-content': {
              caretColor: editorColors.primary,
            },
            '.cm-cursor, .cm-dropCursor': {
              borderLeftColor: editorColors.primary,
              borderLeftWidth: '2px',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              backgroundColor: `${editorColors.primary}30`,
            },
            '.cm-activeLine': {
              backgroundColor: `${editorColors.primary}10`,
            },
            '.cm-activeLineGutter': {
              backgroundColor: `${editorColors.primary}15`,
            },
            '.cm-gutters': {
              backgroundColor: editorColors.bgCard,
              borderRight: `1px solid ${editorColors.border}`,
            },
            '.cm-lineNumbers .cm-gutterElement': {
              color: editorColors.textMuted,
            },
            '.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter': {
              color: editorColors.primaryLight,
            },
          }),
        ],
      });

      viewRef.current = view;
      onReady?.(view);

      // Block insert-mode keys in normal mode (no-op instead of entering insert).
      INSERT_MODE_KEYS.forEach(k => Vim.map(k, '<Nop>', 'normal'));

      // Refocus the editor whenever it loses focus unintentionally.
      // Parents opt into allowing blur via the shouldAllowBlur callback.
      const handleBlur = () => {
        const allowBlur = shouldAllowBlurRef.current;
        if (!allowBlur || !allowBlur()) {
          requestAnimationFrame(() => viewRef.current?.focus());
        }
      };
      view.contentDOM.addEventListener('blur', handleBlur);

      // Auto-focus on mount.
      view.focus();

      return () => {
        // Restore default insert-mode key behavior for any future editors.
        INSERT_MODE_KEYS.forEach(k => Vim.unmap(k, 'normal'));
        view.contentDOM.removeEventListener('blur', handleBlur);
        view.destroy();
        viewRef.current = null;
      };
      // initialDoc is intentionally read only on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} />;
  },
);

VimRaceEditor.displayName = 'VimRaceEditor';
