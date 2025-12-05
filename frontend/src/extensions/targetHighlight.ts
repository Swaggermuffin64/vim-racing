import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

// Effect to set the target position (for navigate tasks - single character)
export const setTargetPosition = StateEffect.define<number | null>();

// Effect to set target range (for delete tasks - multiple characters)
export const setTargetRange = StateEffect.define<{ from: number; to: number } | null>();

// Decoration mark for single target character (navigate - coral/red)
const targetMark = Decoration.mark({
  class: 'cm-target-highlight',
});

// Decoration mark for delete range (orange/amber)
const deleteRangeMark = Decoration.mark({
  class: 'cm-delete-highlight',
});

// StateField to track and display the target highlight
export const targetHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Check for our effects
    for (const effect of tr.effects) {
      // Handle single position (navigate)
      if (effect.is(setTargetPosition)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const pos = effect.value;
        const docLength = tr.state.doc.length;
        
        if (pos >= 0 && pos < docLength) {
          return RangeSet.of([targetMark.range(pos, pos + 1)]);
        }
        return Decoration.none;
      }
      
      // Handle range (delete)
      if (effect.is(setTargetRange)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const { from, to } = effect.value;
        const docLength = tr.state.doc.length;
        
        if (from >= 0 && to <= docLength && from < to) {
          return RangeSet.of([deleteRangeMark.range(from, to)]);
        }
        return Decoration.none;
      }
    }
    // Map decorations through document changes
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Theme for target highlights
export const targetHighlightTheme = EditorView.baseTheme({
  // Navigate highlight (coral/red)
  '.cm-target-highlight': {
    backgroundColor: '#ff6b6b',
    color: '#1a1a2e',
    borderRadius: '2px',
    boxShadow: '0 0 8px #ff6b6b, 0 0 16px #ff6b6b55',
    animation: 'pulse-navigate 1.5s ease-in-out infinite',
  },
  // Delete highlight (orange/amber)
  '.cm-delete-highlight': {
    backgroundColor: '#f59e0b',
    color: '#1a1a2e',
    borderRadius: '2px',
    boxShadow: '0 0 8px #f59e0b, 0 0 16px #f59e0b55',
    animation: 'pulse-delete 1.5s ease-in-out infinite',
  },
  '@keyframes pulse-navigate': {
    '0%, 100%': {
      boxShadow: '0 0 8px #ff6b6b, 0 0 16px #ff6b6b55',
    },
    '50%': {
      boxShadow: '0 0 12px #ff6b6b, 0 0 24px #ff6b6b88',
    },
  },
  '@keyframes pulse-delete': {
    '0%, 100%': {
      boxShadow: '0 0 8px #f59e0b, 0 0 16px #f59e0b55',
    },
    '50%': {
      boxShadow: '0 0 12px #f59e0b, 0 0 24px #f59e0b88',
    },
  },
});

// Combined extension for easy import
export const targetHighlightExtension = [
  targetHighlightField,
  targetHighlightTheme,
];

