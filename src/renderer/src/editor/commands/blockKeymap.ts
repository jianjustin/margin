import { EditorView, keymap, type KeyBinding } from '@codemirror/view'
import {
  setHeading,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  moveLines,
  duplicateLines,
  wrapLink,
  type EditDoc,
  type EditResult
} from '@/editor-core'
import { applyEditResult } from './applyEdit'

/** Wrap a pure editor-core command as a CM keymap `run`. A null result is a no-op. */
function cmd(fn: (doc: EditDoc) => EditResult | null) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main
    const result = fn({ text: view.state.doc.toString(), selection: { from, to } })
    if (!result) return false
    return applyEditResult(view, result)
  }
}

/**
 * Block-level formatting + line-manipulation shortcuts, all routed through
 * editor-core's pure commands. Bindings are chosen to avoid clashing with the
 * default keymap (no plain Mod-digit / Alt-Arrow bindings exist there) and with
 * the app's ⌘K file search.
 */
export const blockKeymap: readonly KeyBinding[] = [
  // Headings ⌘⌥1–6, paragraph ⌘⌥0
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    key: `Mod-Alt-${level}`,
    run: cmd((doc) => setHeading(doc, level)),
    preventDefault: true
  })),
  { key: 'Mod-Alt-0', run: cmd((doc) => setHeading(doc, 0)), preventDefault: true },

  // Lists / quote (Obsidian-style ⌘⇧7 ordered, ⌘⇧8 bullet, ⌘⇧9 task)
  { key: 'Mod-Shift-7', run: cmd(toggleOrderedList), preventDefault: true },
  { key: 'Mod-Shift-8', run: cmd(toggleBulletList), preventDefault: true },
  { key: 'Mod-Shift-9', run: cmd(toggleTaskList), preventDefault: true },
  { key: "Mod-Shift-.", run: cmd(toggleBlockquote), preventDefault: true },

  // Link ⌘⇧K (⌘K is the app's file search)
  { key: 'Mod-Shift-k', run: cmd((doc) => wrapLink(doc)), preventDefault: true },

  // Move / duplicate lines (VS Code-style)
  { key: 'Alt-ArrowUp', run: cmd((doc) => moveLines(doc, -1)), preventDefault: true },
  { key: 'Alt-ArrowDown', run: cmd((doc) => moveLines(doc, 1)), preventDefault: true },
  { key: 'Shift-Alt-ArrowDown', run: cmd(duplicateLines), preventDefault: true }
]

export const blockCommands = keymap.of(blockKeymap)
