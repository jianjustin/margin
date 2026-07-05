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

/**
 * True if any selection range touches [from-pad, to+pad] (offset-level).
 * Marker-grade reveal: only the syntax token the cursor is actually on/next to
 * flips to source — the rest of the line keeps its rendered form (Typora-style).
 */
export function markerRevealed(
  state: EditorState,
  from: number,
  to: number,
  pad = 1
): boolean {
  const lo = Math.max(0, from - pad)
  const hi = Math.min(state.doc.length, to + pad)
  for (const range of state.selection.ranges) {
    if (range.to >= lo && range.from <= hi) return true
  }
  return false
}
