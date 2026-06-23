import { EditorView } from '@codemirror/view'
import type { EditResult } from '@/editor-core'

/**
 * CodeMirror adapter for an editor-core {@link EditResult}: turn the offset-based
 * changes (and optional resulting selection) into a single dispatched
 * transaction. Returns true so it can be used directly as a keymap `run`.
 */
export function applyEditResult(view: EditorView, result: EditResult): boolean {
  view.dispatch({
    changes: result.changes,
    selection: result.selection
      ? { anchor: result.selection.from, head: result.selection.to }
      : undefined,
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}
