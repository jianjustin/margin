import { EditorView } from '@codemirror/view'
import {
  toggleInlineMark,
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
import type { CommandDef } from '@/core/commands/registry'
import { applyEditResult } from './applyEdit'

/** Read the primary selection into an editor-core EditDoc. */
function docOf(view: EditorView): EditDoc {
  const { from, to } = view.state.selection.main
  return { text: view.state.doc.toString(), selection: { from, to } }
}

/** Run a pure command against the view's current doc; null result is a no-op. */
function exec(view: EditorView, fn: (doc: EditDoc) => EditResult | null): void {
  const result = fn(docOf(view))
  if (result) applyEditResult(view, result)
}

/**
 * The editor's commands as registry entries (Ctx = EditorView). This is the
 * catalog the command palette and menus draw from; the keymaps in
 * `inlineMarkKeymap` / `blockKeymap` bind the same underlying pure commands.
 */
export const editorCommands: CommandDef<EditorView>[] = [
  // Inline
  { id: 'editor.toggleBold', title: '粗体', category: '编辑', keybinding: 'Mod-b', run: (v) => exec(v, (d) => toggleInlineMark(d, 'bold')) },
  { id: 'editor.toggleItalic', title: '斜体', category: '编辑', keybinding: 'Mod-i', run: (v) => exec(v, (d) => toggleInlineMark(d, 'italic')) },
  { id: 'editor.toggleCode', title: '行内代码', category: '编辑', keybinding: 'Mod-e', run: (v) => exec(v, (d) => toggleInlineMark(d, 'code')) },
  { id: 'editor.toggleStrike', title: '删除线', category: '编辑', keybinding: 'Mod-Shift-x', run: (v) => exec(v, (d) => toggleInlineMark(d, 'strike')) },
  { id: 'editor.toggleHighlight', title: '高亮', category: '编辑', keybinding: 'Mod-Shift-h', run: (v) => exec(v, (d) => toggleInlineMark(d, 'highlight')) },
  { id: 'editor.insertLink', title: '插入链接', category: '编辑', keybinding: 'Mod-Shift-k', run: (v) => exec(v, (d) => wrapLink(d)) },

  // Block
  { id: 'editor.heading1', title: '一级标题', category: '段落', keybinding: 'Mod-Alt-1', run: (v) => exec(v, (d) => setHeading(d, 1)) },
  { id: 'editor.heading2', title: '二级标题', category: '段落', keybinding: 'Mod-Alt-2', run: (v) => exec(v, (d) => setHeading(d, 2)) },
  { id: 'editor.heading3', title: '三级标题', category: '段落', keybinding: 'Mod-Alt-3', run: (v) => exec(v, (d) => setHeading(d, 3)) },
  { id: 'editor.paragraph', title: '正文段落', category: '段落', keybinding: 'Mod-Alt-0', run: (v) => exec(v, (d) => setHeading(d, 0)) },
  { id: 'editor.bulletList', title: '无序列表', category: '段落', keybinding: 'Mod-Shift-8', run: (v) => exec(v, toggleBulletList) },
  { id: 'editor.orderedList', title: '有序列表', category: '段落', keybinding: 'Mod-Shift-7', run: (v) => exec(v, toggleOrderedList) },
  { id: 'editor.taskList', title: '任务列表', category: '段落', keybinding: 'Mod-Shift-9', run: (v) => exec(v, toggleTaskList) },
  { id: 'editor.blockquote', title: '引用块', category: '段落', keybinding: 'Mod-Shift-.', run: (v) => exec(v, toggleBlockquote) },

  // Lines
  { id: 'editor.moveLineUp', title: '上移行', category: '行', keybinding: 'Alt-ArrowUp', run: (v) => exec(v, (d) => moveLines(d, -1)) },
  { id: 'editor.moveLineDown', title: '下移行', category: '行', keybinding: 'Alt-ArrowDown', run: (v) => exec(v, (d) => moveLines(d, 1)) },
  { id: 'editor.duplicateLine', title: '复制行', category: '行', keybinding: 'Shift-Alt-ArrowDown', run: (v) => exec(v, duplicateLines) }
]
