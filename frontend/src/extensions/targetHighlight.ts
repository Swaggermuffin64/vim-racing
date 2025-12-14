import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, gutter, GutterMarker } from '@codemirror/view';

// Effect to set the target position (for navigate tasks - single character)
export const setTargetPosition = StateEffect.define<number | null>();

// Effect to set target range (for delete tasks - multiple characters)
export const setTargetRange = StateEffect.define<{ from: number; to: number } | null>();

// Decoration mark for single target character (navigate - coral/red)
const targetMark = Decoration.mark({
  class: 'cm-target-highlight',
});

// Decoration mark for delete range (magenta/pink)
const deleteRangeMark = Decoration.mark({
  class: 'cm-delete-highlight',
});

/**
 * Gutter marker for lines that will be merged (after a newline in the target range)
 */
class MergeLineMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('div');
    marker.className = 'cm-merge-line-marker';
    return marker;
  }
}

const mergeLineMarker = new MergeLineMarker();

/**
 * State field to track which lines should have the merge marker
 */
export const mergeLineState = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(markers, tr) {
    // Check for setTargetRange effect
    for (const effect of tr.effects) {
      if (effect.is(setTargetRange)) {
        if (effect.value === null) {
          return RangeSet.empty;
        }
        const { from, to } = effect.value;
        return buildMergeLineMarkers(tr.state.doc, from, to);
      }
      if (effect.is(setTargetPosition)) {
        return RangeSet.empty;
      }
    }
    
    // On doc change, rebuild markers if we have any
    if (tr.docChanged && markers !== RangeSet.empty) {
      // Find current highlight range and rebuild
      let hasRange = false;
      let from = 0, to = 0;
      
      const decorations = tr.state.field(targetHighlightField, false);
      if (decorations) {
        decorations.between(0, tr.state.doc.length, (f, t, deco) => {
          if (deco.spec.class === 'cm-delete-highlight') {
            hasRange = true;
            from = f;
            to = t;
          }
        });
      }
      
      if (hasRange && from < to) {
        return buildMergeLineMarkers(tr.state.doc, from, to);
      }
      return RangeSet.empty;
    }
    
    return markers;
  },
});

/**
 * Build markers for lines that come after newlines in the target range
 */
function buildMergeLineMarkers(
  doc: { sliceString: (from: number, to: number) => string; lineAt: (pos: number) => { from: number; to: number; number: number }; lines: number },
  from: number,
  to: number
): RangeSet<GutterMarker> {
  const markers: Array<{ from: number; marker: GutterMarker }> = [];
  const text = doc.sliceString(from, to);
  let searchPos = 0;
  
  while ((searchPos = text.indexOf('\n', searchPos)) !== -1) {
    // Position right after the newline
    const posAfterNewline = from + searchPos + 1;
    
    // Make sure we're not past the end of the range
    if (posAfterNewline <= to) {
      const nextLine = doc.lineAt(posAfterNewline);
      markers.push({ from: nextLine.from, marker: mergeLineMarker });
    }
    searchPos++;
  }
  
  // Sort and dedupe
  const sorted = markers.sort((a, b) => a.from - b.from);
  return RangeSet.of(sorted.map(m => m.marker.range(m.from)));
}

/**
 * Gutter extension that shows merge line markers (sits next to line numbers)
 */
export const mergeLineGutter = gutter({
  class: 'cm-merge-line-gutter',
  lineMarker: (view, line) => {
    const markers = view.state.field(mergeLineState);
    let hasMarker = false;
    markers.between(line.from, line.from + 1, () => { hasMarker = true; });
    return hasMarker ? mergeLineMarker : null;
  },
});

/**
 * Build decorations for a delete range (just the highlight, no line indicators)
 */
function buildDeleteDecorations(from: number, to: number): DecorationSet {
  // Just add the main highlight
  return RangeSet.of([deleteRangeMark.range(from, to)]);
}

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
          return buildDeleteDecorations(from, to);
        }
        return Decoration.none;
      }
    }
    
    // Map decorations through document changes and rebuild if needed
    if (tr.docChanged && decorations !== Decoration.none) {
      // Extract the current range from decorations and rebuild
      let hasRange = false;
      let from = 0, to = 0;
      
      decorations.between(0, tr.state.doc.length, (f, t, deco) => {
        if (deco.spec.class === 'cm-delete-highlight') {
          hasRange = true;
          from = tr.changes.mapPos(f, 1);
          to = tr.changes.mapPos(t, -1);
        }
      });
      
      if (hasRange && from < to) {
        return buildDeleteDecorations(from, to);
      }
      return Decoration.none;
    }
    
    return decorations;
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
  // Merge line gutter - narrow column next to line numbers
  '.cm-merge-line-gutter': {
    width: '4px',
    backgroundColor: 'transparent',
  },
  '.cm-merge-line-gutter .cm-gutterElement': {
    padding: '0',
  },
  // Marker that indicates this line will be merged (colored bar)
  '.cm-merge-line-marker': {
    width: '4px',
    height: '100%',
    backgroundColor: '#ec4899',
  },
});

// Combined extension for easy import
export const targetHighlightExtension = [
  targetHighlightField,
  mergeLineState,
  mergeLineGutter,
  targetHighlightTheme,
];

