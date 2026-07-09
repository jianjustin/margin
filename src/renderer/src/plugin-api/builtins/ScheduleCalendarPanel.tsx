import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { collectScheduleDates, formatDateKey } from '@/core/schedule'

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

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface ScheduleCalendarPanelProps {
  onOpenSchedule?: (date: Date) => void
}

/**
 * The Schedule tab's calendar UI (moved out of OutlineDrawer for P5.2 — this
 * is now the `render()` target of the built-in schedule plugin's sidebar
 * panel). Reads tree/scheduleDir/content from stores directly instead of via
 * props, since it's mounted standalone by the plugin host, not by a parent
 * that owns that data.
 */
export function ScheduleCalendarPanel({
  onOpenSchedule
}: ScheduleCalendarPanelProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const tree = useVaultStore((s) => s.tree)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const activeScheduleDate = useMemo(() => parseCurrentScheduleDate(content), [content])
  const [calendarView, setCalendarView] = useState(() => {
    const anchor = activeScheduleDate ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const scheduleDates = useMemo(() => collectScheduleDates(tree, scheduleDir), [tree, scheduleDir])
  const calendarCells = useMemo(() => monthGrid(calendarView), [calendarView])

  useEffect(() => {
    if (!activeScheduleDate) return
    setCalendarView(new Date(activeScheduleDate.getFullYear(), activeScheduleDate.getMonth(), 1))
  }, [activeScheduleDate])

  return (
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
                <span aria-hidden className="mt-[2px] h-1 w-1 rounded-full bg-[color:var(--red)]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
