/**
 * List-editing primitives. These already live as pure functions under
 * `editor/listContinuation` (the CodeMirror keymap there is a thin adapter over
 * them); editor-core re-exports them as the canonical command surface so the
 * view layer can depend on the boundary rather than the file location.
 */
export {
  parseListLine,
  listEnterAction,
  indentListLine,
  outdentListLine,
  LIST_INDENT
} from '@/editor/listContinuation'

export type { ParsedListLine, ListEnterAction } from '@/editor/listContinuation'
