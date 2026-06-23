/**
 * editor-core — Margin's platform-independent Markdown editor kernel.
 *
 * This module is the boundary the roadmap (P0.1) calls for: the editor's
 * *semantics* live here, decoupled from any concrete renderer or runtime. It
 * has two halves:
 *
 *   • Projection  — parse Markdown into a renderer-neutral list of decoration
 *                   specs ({@link collectDecorations}) plus the cursor-reveal
 *                   policy ({@link rangeRevealed}). See `./projection`.
 *
 *   • Commands    — pure text transformations expressed as offset-based
 *                   {@link EditResult}s: inline mark toggles, list
 *                   continuation/indent, task-checkbox toggle, table row ops.
 *                   None of these import CodeMirror; the view layer adapts an
 *                   `EditResult` into a transaction. See `./commands/*`.
 *
 * Raw Markdown text is always the source of truth — nothing here changes how a
 * document is stored.
 *
 * Adapters (CodeMirror today) live OUTSIDE this module under `editor/`; they are
 * the only code allowed to translate between core values and a specific editor
 * runtime. Keep this surface free of `@codemirror/view` imports.
 */

// ── Contracts ────────────────────────────────────────────────────────────────
export type { TextRange, EditDoc, TextChange, EditResult } from './types'

// ── Projection (parse → render model) ────────────────────────────────────────
export { collectDecorations, frontmatterEnd, rangeRevealed } from './projection'
export type { DecoSpec, DecoKind } from './projection'

// ── Commands (text transformations) ──────────────────────────────────────────
export { toggleInlineMark, INLINE_MARKERS } from './commands/inlineMark'
export type { InlineMarkKind } from './commands/inlineMark'

export { toggleTaskOnLine, isTaskLine } from './commands/checkbox'

export {
  parseListLine,
  listEnterAction,
  indentListLine,
  outdentListLine,
  LIST_INDENT
} from './commands/list'
export type { ParsedListLine, ListEnterAction } from './commands/list'

export {
  parseTable,
  serializeTable,
  deleteTableRow,
  insertTableRow
} from './commands/table'
export type { TableModel, Align } from './commands/table'
