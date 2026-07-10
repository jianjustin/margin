import { useEffect, useRef, useState } from 'react'
import { usePluginUiStore, type RegisteredSidebarPanel } from '@/stores/pluginUiStore'

interface OutlineDrawerProps {
  width: number
}

/** Reparents an already-rendered plugin panel container into visible DOM while active; detaching (not unmounting) it when the tab switches away, so the panel's React state survives. */
function PanelSlot({ container }: { container: HTMLElement }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.appendChild(container)
  }, [container])
  return <div ref={ref} className="flex min-h-0 flex-1 flex-col" />
}

/**
 * A generic host for plugin-contributed sidebar panels (P5.3) — renders one
 * tab per entry in `pluginUiStore`'s `sidebarPanels`, with no built-in tabs of
 * its own. Both "Outline" and "Schedule" are now plugins (`outlinePlugin`,
 * `schedulePlugin`, both activated by `usePluginHost`); this component only
 * knows how to switch between whatever panels are currently registered, and
 * falls back to the first available panel when the active one disappears
 * (e.g. the schedule plugin deactivating while its tab is selected).
 */
export function OutlineDrawer({ width }: OutlineDrawerProps): JSX.Element {
  const panels = usePluginUiStore((s) => s.sidebarPanels)
  const [tab, setTab] = useState<string>('')

  useEffect(() => {
    if (panels.some((p) => p.descriptor.id === tab)) return
    setTab(panels[0]?.descriptor.id ?? '')
  }, [panels, tab])

  const activePanel: RegisteredSidebarPanel | undefined = panels.find(
    (p) => p.descriptor.id === tab
  )

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[var(--drawer-shadow)]"
    >
      <div className="mb-[18px] flex shrink-0 rounded-lg bg-[color:var(--bg-hover)] p-[3px]">
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
      {activePanel ? (
        <PanelSlot key={activePanel.descriptor.id} container={activePanel.container} />
      ) : null}
    </aside>
  )
}
