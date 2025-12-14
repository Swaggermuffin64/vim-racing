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
// Using cyan for navigate and magenta for delete - these contrast well with oneDark syntax colors
export const targetHighlightTheme = EditorView.baseTheme({
  // Navigate highlight (cyan/teal - semi-transparent to keep text readable)
  '.cm-target-highlight': {
    backgroundColor: 'rgba(6, 182, 212, 0.35)',
    outline: '2px solid #06b6d4',
  },
  // Delete highlight (magenta/pink - semi-transparent to keep text readable)
  '.cm-delete-highlight': {
    backgroundColor: 'rgba(236, 72, 153, 0.35)',
    outline: '2px solid #ec4899',
  },
});

// Combined extension for easy import
export const targetHighlightExtension = [
  targetHighlightField,
  targetHighlightTheme,
];

