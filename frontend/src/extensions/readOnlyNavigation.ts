import { EditorState, TransactionSpec, StateEffect, StateField, Extension } from '@codemirror/state';

/**
 * State effect to toggle delete mode on/off
 */
export const setDeleteMode = StateEffect.define<boolean>();

/**
 * State effect to allow a reset (bypasses the read-only filter)
 */
export const allowReset = StateEffect.define<boolean>();

/**
 * State field that tracks whether deletions are allowed
 */
const deleteModeState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDeleteMode)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * Extension that allows Vim navigation but blocks document modifications.
 * When delete mode is enabled, deletions are allowed but insertions are still blocked.
 */
const readOnlyFilter = EditorState.transactionFilter.of((tr) => {
  // If no document changes, allow everything (navigation, selection, etc.)
  if (!tr.docChanged) {
    return tr;
  }

  // Check if this transaction has an allowReset effect - if so, let it through
  for (const effect of tr.effects) {
    if (effect.is(allowReset) && effect.value) {
      return tr;
    }
  }

  // Check if delete mode is enabled
  const deleteMode = tr.startState.field(deleteModeState);

  if (deleteMode) {
    // In delete mode, allow deletions (where new content is shorter or empty)
    // but block insertions
    let isDeletionOnly = true;
    
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      // If inserted text is non-empty and we're not replacing existing text
      // with shorter text, it's an insertion
      if (inserted.length > 0 && (toA - fromA) < inserted.length) {
        isDeletionOnly = false;
      }
    });

    if (isDeletionOnly) {
      return tr; // Allow deletion
    }
  }

  // Block the document change but preserve selection/scroll
  const newTr: TransactionSpec = {};
  
  if (tr.selection) {
    newTr.selection = tr.selection;
  }
  
  if (tr.scrollIntoView) {
    newTr.scrollIntoView = true;
  }
  
  return newTr;
});

/**
 * The read-only navigation extension bundle.
 * Use setDeleteMode effect to toggle deletion capability.
 */
export const readOnlyNavigation: Extension = [
  deleteModeState,
  readOnlyFilter,
];
