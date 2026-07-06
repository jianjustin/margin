import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { collectScheduleDates, formatDateKey } from '@/core/schedule'
import { collectOutline, type OutlineItem } from '@/editor-core'
import type { TreeNode } from '../../../shared/ipc'

function parseScheduleDate(value: string | null): Date | null {
  if (!value) return null
  const normalized = value.trim().replace(/\//g, '-')
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function parseCurrentScheduleDate(content: string): Date | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === '---') break
      const date = trimmed.match(/^date:\s*(.+)$/i)
      if (date) return parseScheduleDate(date[1])
    }
  }
  const title = content.match(/^#\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/m)
  return title ? parseScheduleDate(title[1]) : null
}

function monthGrid(view: Date): Date[] {
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return cells
}

interface OutlineDrawerProps {
  width: number
  tree?: TreeNode[]
  scheduleDir?: string
  onJumpToLine?: (line: number) => void
  onOpenSchedule?: (date: Date) => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function OutlineDrawer({
  width,
  tree = [],
  scheduleDir = '日程',
  onJumpToLine,
  onOpenSchedule
}: OutlineDrawerProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => collectOutline(content), [content])
  const activeScheduleDate = useMemo(() => parseCurrentScheduleDate(content), [content])
  const [calendarView, setCalendarView] = useState(() => {
    const anchor = activeScheduleDate ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const scheduleDates = useMemo(() => collectScheduleDates(tree, scheduleDir), [tree, scheduleDir])
  const calendarCells = useMemo(() => monthGrid(calendarView), [calendarView])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tab, setTab] = useState<'outline' | 'schedule'>('outline')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!activeScheduleDate) return
    setCalendarView(new Date(activeScheduleDate.getFullYear(), activeScheduleDate.getMonth(), 1))
  }, [activeScheduleDate])

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
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[var(--drawer-shadow)]"
    >
      <div className="mb-[18px] flex shrink-0 rounded-lg bg-[color:var(--bg-hover)] p-[3px]">
        {(['outline', 'schedule'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 rounded-md py-[7px] text-[12.5px] transition-colors',
              tab === t
                ? 'bg-[color:var(--bg-elev)] font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)]'
                : 'font-medium text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
            ].join(' ')}
          >
            {t === 'outline' ? 'Outline' : 'Schedule'}
          </button>
        ))}
      </div>
      {tab === 'outline' ? (
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
      ) : (
        <div className="flex-1 overflow-y-auto pb-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              aria-label="上个月"
              className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="text-[13px] font-bold text-foreground">
              {calendarView.getFullYear()} 年 {calendarView.getMonth() + 1} 月
            </div>
            <button
              type="button"
              onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              aria-label="下个月"
              className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-2 px-1 text-center">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="pb-1 font-[family-name:var(--mono)] text-[10px] font-medium text-[color:var(--text-faint)]">
                {weekday}
              </div>
            ))}
            {calendarCells.map((date) => {
              const key = formatDateKey(date)
              const inMonth = date.getMonth() === calendarView.getMonth()
              const selected = activeScheduleDate ? key === formatDateKey(activeScheduleDate) : false
              const today = key === formatDateKey(new Date())
              const hasNote = scheduleDates.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onOpenSchedule?.(date)}
                    title={hasNote ? `${key} · 已有日程` : key}
                    aria-label={key}
                    className="group mx-auto flex h-[40px] w-[34px] flex-col items-center justify-start rounded-lg pt-[3px] transition-colors hover:bg-[color:var(--bg-hover)]"
                  >
                    <span
                      className={[
                        'grid h-[30px] w-[30px] place-items-center rounded-lg text-[13px] transition-colors',
                        selected
                          ? 'bg-[color:var(--accent)] font-bold text-[color:var(--accent-ink)]'
                          : inMonth
                            ? 'bg-[color:var(--bg-panel)] font-medium text-[color:var(--text-dim)]'
                            : 'bg-transparent font-medium text-[color:var(--text-faint)]',
                        !selected && today ? 'shadow-[inset_0_0_0_1px_var(--accent-line)]' : ''
                      ].join(' ')}
                    >
                      {date.getDate()}
                    </span>
                    {hasNote && (
                      <span
                        aria-hidden
                        className="mt-[2px] h-1 w-1 rounded-full bg-[color:var(--red)]"
                      />
                    )}
                  </button>
                )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
