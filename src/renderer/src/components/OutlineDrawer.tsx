import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePluginUiStore, type RegisteredSidebarPanel } from '@/stores/pluginUiStore'
import { collectOutline, type OutlineItem } from '@/editor-core'

interface OutlineDrawerProps {
  width: number
  onJumpToLine?: (line: number) => void
}

/** Reparents an already-rendered plugin panel container into visible DOM while active; detaching (not unmounting) it when the tab switches away, so the panel's React state survives. */
function PanelSlot({ container }: { container: HTMLElement }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.appendChild(container)
  }, [container])
  return <div ref={ref} className="flex min-h-0 flex-1 flex-col" />
}

export function OutlineDrawer({ width, onJumpToLine }: OutlineDrawerProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => collectOutline(content), [content])
  const panels = usePluginUiStore((s) => s.sidebarPanels)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tab, setTab] = useState<string>('outline')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (tab === 'outline') return
    if (!panels.some((p) => p.descriptor.id === tab)) setTab('outline')
  }, [panels, tab])

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

  const activePanel: RegisteredSidebarPanel | undefined = panels.find(
    (p) => p.descriptor.id === tab
  )

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[var(--drawer-shadow)]"
    >
      <div className="mb-[18px] flex shrink-0 rounded-lg bg-[color:var(--bg-hover)] p-[3px]">
        <button
          onClick={() => setTab('outline')}
          className={[
            'flex-1 rounded-md py-[7px] text-[12.5px] transition-colors',
            tab === 'outline'
              ? 'bg-[color:var(--bg-elev)] font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)]'
              : 'font-medium text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
          ].join(' ')}
        >
          Outline
        </button>
        {panels.map((p) => (
          <button
            key={p.descriptor.id}
            onClick={() => setTab(p.descriptor.id)}
            className={[
              'flex-1 rounded-md py-[7px] text-[12.5px] transition-colors',
              tab === p.descriptor.id
                ? 'bg-[color:var(--bg-elev)] font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)]'
                : 'font-medium text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
            ].join(' ')}
          >
            {p.descriptor.title}
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
      ) : activePanel ? (
        <PanelSlot key={activePanel.descriptor.id} container={activePanel.container} />
      ) : null}
    </aside>
  )
}
