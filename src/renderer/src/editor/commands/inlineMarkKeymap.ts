import { EditorView, keymap, type KeyBinding } from '@codemirror/view'
import { toggleInlineMark, type InlineMarkKind } from '@/editor-core'
import { applyEditResult } from './applyEdit'

/** Build a CM command that toggles one inline mark around the primary selection. */
function toggle(kind: InlineMarkKind) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main
    const result = toggleInlineMark(
      { text: view.state.doc.toString(), selection: { from, to } },
      kind
    )
    return applyEditResult(view, result)
  }
}

/**
 * Inline-formatting shortcuts, mapped through editor-core's pure
 * {@link toggleInlineMark}. These were previously unbound — a WYSIWYG editor
 * should let ⌘B bold the selection without typing the asterisks.
 */
export const inlineMarkKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggle('bold'), preventDefault: true },
  { key: 'Mod-i', run: toggle('italic'), preventDefault: true },
  { key: 'Mod-e', run: toggle('code'), preventDefault: true },
  { key: 'Mod-Shift-x', run: toggle('strike'), preventDefault: true },
  { key: 'Mod-Shift-h', run: toggle('highlight'), preventDefault: true }
]

export const inlineMarkCommands = keymap.of(inlineMarkKeymap)
