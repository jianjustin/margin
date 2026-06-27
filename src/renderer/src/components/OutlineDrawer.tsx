import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'

interface HeadingItem {
  level: number
  text: string
  line: number
}

function parseHeadings(content: string): HeadingItem[] {
  const lines = content.split('\n')
  const headings: HeadingItem[] = []
  let inFence = false
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && line === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      continue
    }
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim(), line: i })
    }
  }
  return headings
}

interface OutlineDrawerProps {
  width: number
  onJumpToLine?: (line: number) => void
}

export function OutlineDrawer({ width, onJumpToLine }: OutlineDrawerProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => parseHeadings(content), [content])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tab, setTab] = useState<'outline' | 'schedule'>('outline')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(heading: HeadingItem, idx: number): void {
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
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[-1px_0_4px_oklch(0_0_0/0.04)]"
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
        <div className="flex flex-1 items-center justify-center text-[12.5px] text-[color:var(--text-faint)]">
          日程功能将在这里显示
        </div>
      )}
    </aside>
  )
}
