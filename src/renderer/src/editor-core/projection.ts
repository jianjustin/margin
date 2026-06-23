/**
 * Projection schema — the parse → render contract.
 *
 * `collectDecorations(state)` walks the Markdown/GFM/Obsidian syntax tree and
 * emits a flat, renderer-neutral list of {@link DecoSpec}s describing how each
 * source range should be styled, concealed, or replaced by a block/inline
 * widget. A renderer (the CodeMirror adapter today) is the only thing that turns
 * these specs into actual decorations — TextKit attributed ranges or a WASM
 * canvas could consume the exact same list.
 *
 * `rangeRevealed` is the cursor-reveal policy: when the selection touches a
 * span, the renderer should show raw Markdown instead of the rendered form.
 *
 * NOTE: `collectDecorations` currently takes a CodeMirror `EditorState` because
 * it relies on the Lezer Markdown tree. Lezer is a parser, not a view, so this
 * is an acceptable core dependency; decoupling the *input* shape (text + tree +
 * selection) from CodeMirror is tracked as a follow-up in the roadmap.
 */
export { collectDecorations, frontmatterEnd } from '@/editor/livePreview/decorationSpecs'
export type { DecoSpec, DecoKind } from '@/editor/livePreview/decorationSpecs'
export { rangeRevealed } from '@/editor/livePreview/reveal'
