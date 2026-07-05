import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDateKey } from '@/lib/schedule'
import { Popover } from '@/components/ui/Popover'
import { ICON_MD } from '@/components/ui/icon'

interface CalendarPopoverProps {
  /** `YYYY-MM-DD` keys that already have a schedule note (rendered with a dot). */
  scheduleDates: Set<string>
  onPick: (date: Date) => void
  onClose: () => void
  /** 浮层锚点坐标（由触发按钮传入）。 */
  anchor: { x: number; y: number }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_LABEL = (y: number, m: number): string => `${y} 年 ${m + 1} 月`

/** Days (as Date) to render for the month grid containing `view`, padded to whole weeks. */
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

export function CalendarPopover({
  scheduleDates,
  onPick,
  onClose,
  anchor
}: CalendarPopoverProps): JSX.Element {
  const today = new Date()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const cells = monthGrid(view)
  const todayKey = formatDateKey(today)
  const viewMonth = view.getMonth()

  return (
    <Popover anchor={anchor} onClose={onClose} className="w-[268px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          aria-label="上个月"
          className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <ChevronLeft size={ICON_MD} />
        </button>
        <span className="text-[12.5px] font-semibold tracking-wide">
          {MONTH_LABEL(view.getFullYear(), view.getMonth())}
        </span>
        <button
          onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          aria-label="下个月"
          className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <ChevronRight size={ICON_MD} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10.5px] font-medium text-[color:var(--text-faint)]">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const key = formatDateKey(d)
          const inMonth = d.getMonth() === viewMonth
          const isToday = key === todayKey
          const hasNote = scheduleDates.has(key)
          return (
            <button
              key={key}
              onClick={() => onPick(d)}
              title={hasNote ? `${key} · 已有日程` : key}
              className={[
                'relative mx-auto grid h-[30px] w-[30px] place-items-center rounded-md text-[12px] transition-colors',
                inMonth ? 'text-foreground' : 'text-[color:var(--text-faint)]',
                isToday
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)]'
                  : 'hover:bg-[color:var(--bg-hover)]'
              ].join(' ')}
            >
              {d.getDate()}
              {hasNote && (
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-[color:var(--accent)]"
                />
              )}
            </button>
          )
        })}
      </div>
    </Popover>
  )
}
