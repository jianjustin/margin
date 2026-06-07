import { useEffect, useRef, useState } from 'react'

export interface SlashMenuItem {
  id: string
  icon: string
  name: string
  desc: string
  shortcut?: string
  markdown: string
}

const ITEMS: SlashMenuItem[] = [
  { id: 'h1', icon: 'H1', name: '一级标题', desc: '章节大标题', shortcut: '#', markdown: '# ' },
  { id: 'h2', icon: 'H2', name: '二级标题', desc: '小节标题', shortcut: '##', markdown: '## ' },
  { id: 'h3', icon: 'H3', name: '三级标题', desc: '细分标题', shortcut: '###', markdown: '### ' },
  { id: 'bullet', icon: '•', name: '无序列表', desc: '项目符号列表', shortcut: '-', markdown: '- ' },
  { id: 'numbered', icon: '1.', name: '有序列表', desc: '编号列表', shortcut: '1.', markdown: '1. ' },
  { id: 'todo', icon: '☐', name: '待办事项', desc: '可勾选的任务', shortcut: '- [ ]', markdown: '- [ ] ' },
  { id: 'quote', icon: '❝', name: '引用', desc: '引用段落', shortcut: '>', markdown: '> ' },
  { id: 'code', icon: '</>', name: '代码块', desc: '插入代码片段', shortcut: '```', markdown: '```\n\n```' },
  { id: 'divider', icon: '—', name: '分隔线', desc: '水平分割线', shortcut: '---', markdown: '---' },
  { id: 'table', icon: '⊞', name: '表格', desc: '插入表格', markdown: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| | | |' },
]

interface SlashMenuProps {
  x: number
  y: number
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
}

export function SlashMenu({ x, y, onSelect, onClose }: SlashMenuProps): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0)
  const [filter, setFilter] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const filtered = filter
    ? ITEMS.filter((it) => it.name.includes(filter) || it.id.includes(filter.toLowerCase()))
    : ITEMS

  useEffect(() => {
    setActiveIdx(0)
  }, [filter])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[activeIdx]) onSelect(filtered[activeIdx])
        return
      }
      if (e.key === 'Backspace') {
        if (filter.length === 0) {
          onClose()
        } else {
          setFilter((f) => f.slice(0, -1))
        }
        e.preventDefault()
        return
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        setFilter((f) => f + e.key)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [activeIdx, filter, filtered, onClose, onSelect])

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      const el = bodyRef.current
      if (el && !el.closest('.slash-menu')?.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  useEffect(() => {
    const el = bodyRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 60,
    width: 292,
    animation: 'slash-in 0.12s ease'
  }

  return (
    <div className="slash-menu flex flex-col overflow-hidden rounded-[10px] border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_18px_48px_oklch(0_0_0/0.45)]" style={menuStyle}>
      <div ref={bodyRef} className="max-h-[298px] overflow-y-auto p-1.5">
        {filter && (
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-faint)]">
            搜索: {filter}
          </div>
        )}
        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-faint)]">
          基本块
        </div>
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-[color:var(--text-faint)]">
            无匹配结果
          </div>
        ) : (
          filtered.map((item, i) => (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] transition-colors',
                i === activeIdx ? 'bg-[color:var(--accent-soft)]' : ''
              ].join(' ')}
            >
              <div
                className={[
                  'grid h-[26px] w-[26px] flex-none place-items-center rounded-md border font-[family-name:var(--mono)] text-[12px] font-semibold text-[color:var(--accent)]',
                  i === activeIdx
                    ? 'border-[color:var(--accent-line)] bg-[color:var(--bg-panel)]'
                    : 'border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]'
                ].join(' ')}
              >
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-[550]">{item.name}</div>
                <div className="text-[11px] text-[color:var(--text-faint)]">{item.desc}</div>
              </div>
              {item.shortcut && (
                <span className="flex-none font-[family-name:var(--mono)] text-[10.5px] text-[color:var(--text-faint)]">
                  {item.shortcut}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-4 border-t border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-3 py-2 text-[11px] text-[color:var(--text-faint)]">
        <span className="inline-flex items-center">
          <kbd className="mr-1 rounded border border-[color:var(--border-soft)] border-b-2 bg-[color:var(--bg-elev)] px-1 font-[family-name:var(--mono)] text-[10px] text-[color:var(--text-dim)]">↑↓</kbd>
          导航
        </span>
        <span className="inline-flex items-center">
          <kbd className="mr-1 rounded border border-[color:var(--border-soft)] border-b-2 bg-[color:var(--bg-elev)] px-1 font-[family-name:var(--mono)] text-[10px] text-[color:var(--text-dim)]">↩</kbd>
          确认
        </span>
        <span className="inline-flex items-center">
          <kbd className="mr-1 rounded border border-[color:var(--border-soft)] border-b-2 bg-[color:var(--bg-elev)] px-1 font-[family-name:var(--mono)] text-[10px] text-[color:var(--text-dim)]">esc</kbd>
          关闭
        </span>
      </div>
    </div>
  )
}
