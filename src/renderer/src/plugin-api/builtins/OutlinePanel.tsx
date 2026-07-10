import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { collectOutline, type OutlineItem } from '@/editor-core'

export interface OutlinePanelProps {
  onJumpToLine?: (line: number) => void
}

/**
 * The Outline tab's heading list (moved out of OutlineDrawer for P5.3 — this
 * is now the `render()` target of the built-in outline plugin's sidebar
 * panel, mirroring ScheduleCalendarPanel's extraction in P5.2). Reads
 * document content from the store directly since it's mounted standalone by
 * the plugin host, not by a parent that owns that data.
 */
export function OutlinePanel({ onJumpToLine }: OutlinePanelProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => collectOutline(content), [content])
  const [activeIdx, setActiveIdx] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(heading: OutlineItem, idx: number): void {
    setActiveIdx(idx)
    onJumpToLine?.(heading.line)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setActiveIdx(-1), 2000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const lvlClass = (level: number): string => {
    if (level === 1) return 'font-semibold text-[color:var(--text)]'
    if (level === 2) return 'pl-[21px]'
    return 'pl-[36px] text-[12px]'
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
        Table of Contents
      </div>
      {headings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-[12.5px] leading-relaxed text-[color:var(--text-faint)]">
          <span>暂无标题</span>
          <span className="text-[11.5px] leading-[1.7]">
            用{' '}
            <code className="rounded bg-[color:var(--bg-elev)] px-1.5 py-px font-[family-name:var(--mono)] text-[color:var(--accent)] text-[11px] border border-[color:var(--border-soft)]">
              # 标题
            </code>{' '}
            创建大纲
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          {headings.map((h, i) => (
            <div
              key={`${h.line}-${h.text}`}
              onClick={() => handleClick(h, i)}
              className={[
                'flex cursor-pointer items-center gap-[9px] overflow-hidden whitespace-nowrap rounded-md px-[10px] py-[6px] text-[13px] leading-[1.45] text-[color:var(--text-dim)] transition-colors',
                activeIdx === i
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)] shadow-[inset_2px_0_0_var(--accent)]'
                  : 'hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text)]',
                lvlClass(h.level)
              ].join(' ')}
            >
              <span className="overflow-hidden text-ellipsis">{h.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
