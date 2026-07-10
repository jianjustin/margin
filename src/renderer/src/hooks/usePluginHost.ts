import { useEffect, useRef } from 'react'
import {
  PluginHost,
  EventBus,
  createSchedulePlugin,
  createOutlinePlugin,
  type HostServices
} from '@/plugin-api'
import { CommandRegistry } from '@/core/commands/registry'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

/**
 * Instantiates the app's `PluginHost` (plugin-api/host.ts) with real
 * `HostServices`. Activates/deactivates both built-in plugins as
 * `enabledPlugins` (settingsStore, P5.4) toggles — before P5.4 the outline
 * plugin was unconditional; PluginMarket now manages both the same way.
 *
 * The outline-activation effect is declared BEFORE the schedule-activation
 * effect so `pluginUiStore.sidebarPanels` always gets `builtin.outline`
 * pushed first when both are enabled — React runs a component's effect
 * setups in declaration order on mount, and `PluginHost.activate`'s
 * synchronous prefix (which includes the plugin's own
 * `ctx.ui.registerSidebarPanel` call) fully runs before the enclosing async
 * function yields at its first `await`, so this ordering is deterministic,
 * not a race. `OutlineDrawer` renders tabs in `sidebarPanels` order, so this
 * is what keeps "Outline" as the first tab.
 *
 * Each effect derives its own boolean from `enabledPlugins` (rather than
 * both depending on the whole array) so toggling one plugin doesn't
 * needlessly tear down and re-mount the other.
 *
 * `commands` uses its own `CommandRegistry` instance, mirroring the pattern
 * already used by `useGlobalKeymap` — binding contributed commands into the
 * global keymap/slash menu is a future task, not this one; this hook only
 * makes the registry real and inspectable.
 *
 * `ui.registerSidebarPanel` renders eagerly into a detached `<div>` (via the
 * panel's own `render()`) and stores it in `pluginUiStore` — OutlineDrawer
 * reparents that same container into visible DOM when its tab is active, so
 * the panel's React state survives tab switches and is only torn down when
 * this hook deactivates the plugin.
 */
export function usePluginHost(
  onOpenToday: (date: Date) => void,
  onJumpToLine: (line: number) => void
): void {
  const outlineEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.outline'))
  const scheduleEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.schedule'))
  const onOpenTodayRef = useRef(onOpenToday)
  onOpenTodayRef.current = onOpenToday
  const onJumpToLineRef = useRef(onJumpToLine)
  onJumpToLineRef.current = onJumpToLine

  const hostRef = useRef<PluginHost | null>(null)
  if (!hostRef.current) {
    const services: HostServices = {
      commands: new CommandRegistry<void>(),
      vaultSnapshot: () => {
        const { root, tree } = useVaultStore.getState()
        return { root: root ?? '', tree }
      },
      events: new EventBus(),
      ui: {
        registerSidebarPanel: (panel) => {
          const container = document.createElement('div')
          container.style.display = 'contents'
          const unmount = panel.render(container)
          usePluginUiStore.getState().addSidebarPanel({ descriptor: panel, container })
          return {
            dispose: () => {
              // Defer unmount() (which drives the panel's nested `createRoot`
              // root.unmount() in schedulePlugin.tsx/outlinePlugin.tsx) past
              // the microtask boundary so it escapes the outer root's
              // passive-effect execution window — calling it synchronously
              // here (this dispose runs from a useEffect cleanup) makes React
              // log "Attempted to synchronously unmount a root while React
              // was already rendering" because ReactDOMRoot.unmount()
              // internally flushSyncs while React's "flushing passive
              // effects" flag is still set. removeSidebarPanel stays
              // synchronous — it's a plain Zustand `set()` unrelated to the
              // React root, and removing the panel immediately is what makes
              // the tab disappear from OutlineDrawer without delay.
              queueMicrotask(() => unmount())
              usePluginUiStore.getState().removeSidebarPanel(panel.id)
            }
          }
        },
        registerStatusItem: (item) => {
          usePluginUiStore.getState().addStatusItem(item)
          return { dispose: () => usePluginUiStore.getState().removeStatusItem(item.id) }
        }
      }
    }
    hostRef.current = new PluginHost(services)
  }

  useEffect(() => {
    const host = hostRef.current!
    if (!outlineEnabled) return
    void host.activate(createOutlinePlugin((line) => onJumpToLineRef.current(line)))
    return () => {
      void host.deactivate('builtin.outline')
    }
  }, [outlineEnabled])

  useEffect(() => {
    const host = hostRef.current!
    if (!scheduleEnabled) return
    void host.activate(createSchedulePlugin((date) => onOpenTodayRef.current(date)))
    return () => {
      void host.deactivate('builtin.schedule')
    }
  }, [scheduleEnabled])
}
