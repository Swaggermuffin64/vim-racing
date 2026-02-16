import { EditorState, TransactionSpec, StateEffect, StateField, Extension } from '@codemirror/state';

/**
 * State effect to toggle delete mode on/off
 */
export const setDeleteMode = StateEffect.define<boolean>();

/**
 * State effect to set the allowed deletion range (for delete tasks)
 */
export const setAllowedDeleteRange = StateEffect.define<{ from: number; to: number } | null>();

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
 * State field that tracks the allowed deletion range.
 * This range shrinks as characters are deleted.
 */
const allowedDeleteRangeState = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    // Check for explicit range set effect
    for (const effect of tr.effects) {
      if (effect.is(setAllowedDeleteRange)) {
        return effect.value;
      }
    }
    
    // Map the range through document changes to keep it in sync
    if (value && tr.docChanged) {
      const newFrom = tr.changes.mapPos(value.from, 1); // 1 = stay at end if deleted
      const newTo = tr.changes.mapPos(value.to, -1);    // -1 = stay at start if deleted
      
      // If the range collapsed or became invalid, return null
      if (newFrom >= newTo) {
        return null;
      }
      return { from: newFrom, to: newTo };
    }
    
    return value;
  },
});

/**
 * Extension that allows Vim navigation but blocks document modifications.
 * When delete mode is enabled, deletions are only allowed within the target range.
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
    const allowedRange = tr.startState.field(allowedDeleteRangeState);
    let isValidDeletion = true;
    
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const isDelete = inserted.length === 0 || inserted.length < (toA - fromA);
      if (!isDelete) {
        isValidDeletion = false;
        return;
      }
      
      if (allowedRange) {
        if (fromA < allowedRange.from || toA > allowedRange.to) {
          isValidDeletion = false;
        }
      }
    });

    if (isValidDeletion) {
      return tr;
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
 * Use setAllowedDeleteRange to restrict deletions to a specific range.
 */
export const readOnlyNavigation: Extension = [
  deleteModeState,
  allowedDeleteRangeState,
  readOnlyFilter,
];
