import { EditorView, ViewUpdate } from '@codemirror/view';

export type CursorChangeCallback = (offset: number) => void;

/**
 * Creates an extension that tracks cursor position changes
 */
export function cursorTracker(onCursorChange: CursorChangeCallback) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.selectionSet) {
      const pos = update.state.selection.main.head;
      onCursorChange(pos);
    }
  });
}
