import type { EditDoc, EditResult } from '../types'

/** Inline Markdown emphasis marks that toggle as a symmetric `marker…marker` pair. */
export type InlineMarkKind = 'bold' | 'italic' | 'strike' | 'code' | 'highlight'

export const INLINE_MARKERS: Record<InlineMarkKind, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
  highlight: '=='
}

/**
 * Toggle an inline emphasis mark around the current selection — the editor-core
 * primitive behind ⌘B / ⌘I / ⌘E and friends. Pure and renderer-agnostic.
 *
 * Four cases, checked in order:
 *  1. The selection already *includes* the markers (`**bold**` selected) → strip them.
 *  2. The markers sit just *outside* the selection (`**[bold]**`) → strip them.
 *  3. Empty selection → insert an empty `marker+marker` pair, caret in the middle.
 *  4. Otherwise → wrap the selection.
 *
 * In every case the returned selection keeps the *content* (sans markers)
 * selected — toggling twice is a no-op on the text and the selection.
 */
export function toggleInlineMark(doc: EditDoc, kind: InlineMarkKind): EditResult {
  const mark = INLINE_MARKERS[kind]
  const len = mark.length
  const { text } = doc
  const { from, to } = doc.selection
  const selected = text.slice(from, to)

  // 1. Selection spans the markers too: unwrap from within.
  if (selected.length >= len * 2 && selected.startsWith(mark) && selected.endsWith(mark)) {
    const inner = selected.slice(len, selected.length - len)
    return {
      changes: [{ from, to, insert: inner }],
      selection: { from, to: from + inner.length }
    }
  }

  // 2. Markers hug the selection from outside: unwrap them.
  const before = text.slice(Math.max(0, from - len), from)
  const after = text.slice(to, to + len)
  if (before === mark && after === mark) {
    return {
      changes: [
        { from: from - len, to: from, insert: '' },
        { from: to, to: to + len, insert: '' }
      ],
      selection: { from: from - len, to: to - len }
    }
  }

  // 3. No selection: drop an empty pair and park the caret between the markers.
  if (from === to) {
    return {
      changes: [{ from, to, insert: mark + mark }],
      selection: { from: from + len, to: from + len }
    }
  }

  // 4. Wrap the selection.
  return {
    changes: [{ from, to, insert: mark + selected + mark }],
    selection: { from: from + len, to: to + len }
  }
}
