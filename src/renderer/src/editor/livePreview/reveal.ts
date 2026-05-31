import type { EditorState } from '@codemirror/state'

/**
 * True if any selection range touches the line span containing [from, to].
 * Used to "reveal" raw markdown syntax on the line/block the cursor is in.
 */
export function rangeRevealed(state: EditorState, from: number, to: number): boolean {
  const lineFrom = state.doc.lineAt(from).from
  const lineTo = state.doc.lineAt(to).to
  for (const range of state.selection.ranges) {
    if (range.to >= lineFrom && range.from <= lineTo) return true
  }
  return false
}
