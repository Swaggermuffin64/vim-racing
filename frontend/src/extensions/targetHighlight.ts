import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

// Effect to set the target position
export const setTargetPosition = StateEffect.define<number | null>();

// Decoration mark for the target character
const targetMark = Decoration.mark({
  class: 'cm-target-highlight',
});

// StateField to track and display the target highlight
export const targetHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Check for our effect
    for (const effect of tr.effects) {
      if (effect.is(setTargetPosition)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        // Create decoration for the target character
        const pos = effect.value;
        const docLength = tr.state.doc.length;
        
        if (pos >= 0 && pos < docLength) {
          return RangeSet.of([targetMark.range(pos, pos + 1)]);
        }
        return Decoration.none;
      }
    }
    // Map decorations through document changes
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Theme for the target highlight
export const targetHighlightTheme = EditorView.baseTheme({
  '.cm-target-highlight': {
    backgroundColor: '#ff6b6b',
    color: '#1a1a2e',
    borderRadius: '2px',
    boxShadow: '0 0 8px #ff6b6b, 0 0 16px #ff6b6b55',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  '@keyframes pulse': {
    '0%, 100%': {
      boxShadow: '0 0 8px #ff6b6b, 0 0 16px #ff6b6b55',
    },
    '50%': {
      boxShadow: '0 0 12px #ff6b6b, 0 0 24px #ff6b6b88',
    },
  },
});

// Combined extension for easy import
export const targetHighlightExtension = [
  targetHighlightField,
  targetHighlightTheme,
];

