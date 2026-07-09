import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PluginHost, EventBus, type HostServices, type CommandContribution, type SidebarPanelContribution } from '@/plugin-api'
import { createSchedulePlugin } from '@/plugin-api/builtins/schedulePlugin'

function makeServices(): HostServices & {
  registered: Map<string, CommandContribution>
  panels: Map<string, SidebarPanelContribution>
} {
  const registered = new Map<string, CommandContribution>()
  const panels = new Map<string, SidebarPanelContribution>()
  return {
    registered,
    panels,
    commands: {
      register: (c) => {
        registered.set(c.id, c)
        return { dispose: () => registered.delete(c.id) }
      }
    },
    vaultSnapshot: () => ({ root: '/v', tree: [] }),
    events: new EventBus(),
    ui: {
      registerSidebarPanel: (panel) => {
        panels.set(panel.id, panel)
        return { dispose: () => panels.delete(panel.id) }
      },
      registerStatusItem: () => ({ dispose: () => {} })
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('schedulePlugin', () => {
  it('declares commands + ui.sidebar permissions only', () => {
    const plugin = createSchedulePlugin(vi.fn())
    expect(plugin.manifest.id).toBe('builtin.schedule')
    expect(plugin.manifest.permissions).toEqual(['commands', 'ui.sidebar'])
  })

  it('registers schedule.openToday, which calls onOpenToday with today', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    const onOpenToday = vi.fn()
    await host.activate(createSchedulePlugin(onOpenToday))

    expect(services.registered.has('schedule.openToday')).toBe(true)
    await services.registered.get('schedule.openToday')!.run()
    expect(onOpenToday).toHaveBeenCalledWith(new Date(2026, 5, 15, 10, 0, 0))
  })

  it('registers a sidebar panel with id builtin.schedule', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createSchedulePlugin(vi.fn()))
    expect(services.panels.has('builtin.schedule')).toBe(true)
    expect(services.panels.get('builtin.schedule')!.title).toBe('Schedule')
  })

  it('deactivation disposes the command and the panel', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createSchedulePlugin(vi.fn()))
    await host.deactivate('builtin.schedule')
    expect(services.registered.size).toBe(0)
    expect(services.panels.size).toBe(0)
  })
})
