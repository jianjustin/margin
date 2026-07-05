import { useEffect, useRef, useState } from 'react'
import { SLASH_COMMANDS, type SlashCommand } from '@/core/commands'
import { Popover } from '@/components/ui/Popover'

/** Slash-menu item shape. The catalog now lives in core/commands/slashCommands. */
export type SlashMenuItem = SlashCommand

const ITEMS: SlashMenuItem[] = SLASH_COMMANDS

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
        // Stop here so neither the Popover's bubble-phase Esc (double onClose)
        // nor the editor keymap sees this keystroke while the menu is open.
        e.stopPropagation()
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
    const el = bodyRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  return (
    <Popover anchor={{ x, y }} onClose={onClose} className="slash-menu flex w-[292px] flex-col overflow-hidden">
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
    </Popover>
  )
}
