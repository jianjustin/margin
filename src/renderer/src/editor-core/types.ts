/**
 * editor-core — platform-independent contracts
 *
 * These types are the boundary between Margin's editor semantics and any
 * concrete renderer/runtime (CodeMirror 6 today; TextKit/WASM tomorrow).
 *
 * The raw Markdown text is always the source of truth. Commands describe edits
 * as offset-based {@link TextChange}s against the *current* document, never as
 * mutated strings, so an adapter can map them straight onto its own transaction
 * model without re-diffing.
 */

/** A half-open `[from, to)` offset span into a document. */
export interface TextRange {
  from: number
  to: number
}

/**
 * The minimal document view a pure command needs: the full text plus the
 * primary selection. Deliberately free of any CodeMirror type so command logic
 * can be unit-tested with a plain object.
 */
export interface EditDoc {
  text: string
  selection: TextRange
}

/**
 * One replacement: drop `[from, to)` and splice in `insert`. Offsets refer to
 * the document as it was when the command ran. Multiple changes in a single
 * {@link EditResult} are independent and all addressed against that original
 * document (the CodeMirror change-set convention).
 */
export interface TextChange {
  from: number
  to: number
  insert: string
}

/**
 * The result of running a command: the text edits to apply and, optionally,
 * where the selection should land afterwards (expressed in *post-edit* offsets).
 */
export interface EditResult {
  changes: TextChange[]
  selection?: TextRange
}
