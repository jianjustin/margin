import type { TextChange } from '../types'

/** A task line: optional indent + list bullet + `[ ]` / `[x]` checkbox. */
const TASK_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/

/**
 * Toggle the task checkbox on a single line of text. Returns the replacement
 * for just the `[ ]`/`[x]` token (offsets relative to the line start), or null
 * when the line carries no task marker.
 *
 * The on-disk convention is lowercase `[x]` for checked and `[ ]` for unchecked;
 * an uppercase `[X]` toggles to unchecked like any checked box.
 *
 * Pure counterpart to the click handler on the rendered checkbox widget, so the
 * same toggle can be driven from a keyboard command without a DOM.
 */
export function toggleTaskOnLine(lineText: string): TextChange | null {
  const m = TASK_RE.exec(lineText)
  if (!m) return null
  const open = m[1].length // index of '[' within the line
  const checked = m[2].toLowerCase() === 'x'
  return { from: open, to: open + 3, insert: checked ? '[ ]' : '[x]' }
}

/** True when a line of text is a task item (has a `[ ]`/`[x]` marker). */
export function isTaskLine(lineText: string): boolean {
  return TASK_RE.test(lineText)
}
