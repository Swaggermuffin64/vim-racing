import { EditorState, TransactionSpec } from '@codemirror/state';

/**
 * Extension that allows Vim navigation but blocks all document modifications.
 * Cursor movement, selection, and scrolling still work, but insert/delete operations are blocked.
 */
export const readOnlyNavigation = EditorState.transactionFilter.of((tr) => {
  // If the transaction has document changes, block it
  if (tr.docChanged) {
    // Return an empty array of transactions to block the change
    // but still allow any selection changes
    const newTr: TransactionSpec = {};
    
    // Preserve selection changes if any
    if (tr.selection) {
      newTr.selection = tr.selection;
    }
    
    // Preserve scroll into view
    if (tr.scrollIntoView) {
      newTr.scrollIntoView = true;
    }
    
    return newTr;
  }
  
  // Allow all other transactions (cursor movement, selection, etc.)
  return tr;
});

