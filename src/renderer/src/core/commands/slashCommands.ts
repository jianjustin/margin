/**
 * Slash-menu insert commands as data, owned by core rather than the UI. The
 * `SlashMenu` component renders this list; moving it here means the same catalog
 * can feed the command palette and be contributed to by plugins later.
 */
export interface SlashCommand {
  id: string
  /** Display name. */
  name: string
  /** One-line description. */
  desc: string
  /** Icon token / glyph shown in the menu. */
  icon: string
  /** Optional accelerator/markup hint shown on the right. */
  shortcut?: string
  /** The Markdown inserted at the caret. */
  markdown: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', icon: 'H1', name: '一级标题', desc: '章节大标题', shortcut: '#', markdown: '# ' },
  { id: 'h2', icon: 'H2', name: '二级标题', desc: '小节标题', shortcut: '##', markdown: '## ' },
  { id: 'h3', icon: 'H3', name: '三级标题', desc: '细分标题', shortcut: '###', markdown: '### ' },
  { id: 'bullet', icon: '•', name: '无序列表', desc: '项目符号列表', shortcut: '-', markdown: '- ' },
  { id: 'numbered', icon: '1.', name: '有序列表', desc: '编号列表', shortcut: '1.', markdown: '1. ' },
  { id: 'todo', icon: '☐', name: '待办事项', desc: '可勾选的任务', shortcut: '- [ ]', markdown: '- [ ] ' },
  { id: 'quote', icon: '❝', name: '引用', desc: '引用段落', shortcut: '>', markdown: '> ' },
  { id: 'code', icon: '</>', name: '代码块', desc: '插入代码片段', shortcut: '```', markdown: '```\n\n```' },
  { id: 'divider', icon: '—', name: '分隔线', desc: '水平分割线', shortcut: '---', markdown: '---' },
  {
    id: 'table',
    icon: '⊞',
    name: '表格',
    desc: '插入表格',
    markdown: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| | | |'
  }
]
