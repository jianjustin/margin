import { useEffect, useRef } from 'react'
import { PluginHost, EventBus, createSchedulePlugin, type HostServices } from '@/plugin-api'
import { CommandRegistry } from '@/core/commands/registry'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

/**
 * Instantiates the app's `PluginHost` (plugin-api/host.ts) with real
 * `HostServices` and activates/deactivates the built-in schedule plugin as
 * `scheduleEnabled` toggles (P5.2 — the first real consumer of PluginHost;
 * previously it only existed inside plugin-api's own tests).
 *
 * `commands` uses its own `CommandRegistry` instance, mirroring the pattern
 * already used by `useGlobalKeymap` — binding these commands into the global
 * keymap/slash menu is a future task (`可绑快捷键/slash`, plan §5.2), not this
 * one; this hook only makes the registry real and inspectable.
 *
 * `ui.registerSidebarPanel` renders eagerly into a detached `<div>` (via the
 * panel's own `render()`) and stores it in `pluginUiStore` — OutlineDrawer
 * reparents that same container into visible DOM when its tab is active, so
 * the panel's React state survives tab switches and is only torn down when
 * this hook deactivates the plugin.
 */
export function usePluginHost(onOpenToday: (date: Date) => void): void {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const onOpenTodayRef = useRef(onOpenToday)
  onOpenTodayRef.current = onOpenToday

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
              unmount()
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
    if (!scheduleEnabled) return
    void host.activate(createSchedulePlugin((date) => onOpenTodayRef.current(date)))
    return () => {
      void host.deactivate('builtin.schedule')
    }
  }, [scheduleEnabled])
}
