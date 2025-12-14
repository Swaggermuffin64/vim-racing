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
        console.log('🎯 [DeleteRange] Set allowed range:', effect.value);
        return effect.value;
      }
    }
    
    // Map the range through document changes to keep it in sync
    if (value && tr.docChanged) {
      const newFrom = tr.changes.mapPos(value.from, 1); // 1 = stay at end if deleted
      const newTo = tr.changes.mapPos(value.to, -1);    // -1 = stay at start if deleted
      
      // If the range collapsed or became invalid, return null
      if (newFrom >= newTo) {
        console.log('🎯 [DeleteRange] Range collapsed, task should be complete');
        return null;
      }
      console.log('🎯 [DeleteRange] Range updated:', { from: newFrom, to: newTo }, '(was:', value, ')');
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
    let blockReason = '';
    
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      // Must be a deletion (inserted text empty or shorter than deleted)
      const isDelete = inserted.length === 0 || inserted.length < (toA - fromA);
      if (!isDelete) {
        isValidDeletion = false;
        blockReason = `Not a deletion: inserted ${inserted.length} chars, deleted ${toA - fromA} chars`;
        return;
      }
      
      // If we have a range restriction, check bounds
      if (allowedRange) {
        // The deletion must be entirely within the allowed range
        if (fromA < allowedRange.from || toA > allowedRange.to) {
          isValidDeletion = false;
          blockReason = `Out of bounds: deletion [${fromA}, ${toA}] not in allowed range [${allowedRange.from}, ${allowedRange.to}]`;
        }
      }
    });

    if (isValidDeletion) {
      console.log('✅ [DeleteFilter] Allowed deletion');
      return tr; // Allow deletion within range
    } else {
      console.log('❌ [DeleteFilter] Blocked:', blockReason);
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
