import { describe, it, expect, vi } from 'vitest'
import { PluginHost, EventBus, type HostServices, type SidebarPanelContribution } from '@/plugin-api'
import { createOutlinePlugin } from '@/plugin-api/builtins/outlinePlugin'

function makeServices(): HostServices & { panels: Map<string, SidebarPanelContribution> } {
  const panels = new Map<string, SidebarPanelContribution>()
  return {
    panels,
    commands: { register: () => ({ dispose: () => {} }) },
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

describe('outlinePlugin', () => {
  it('declares ui.sidebar permission only (no commands)', () => {
    const plugin = createOutlinePlugin(vi.fn())
    expect(plugin.manifest.id).toBe('builtin.outline')
    expect(plugin.manifest.permissions).toEqual(['ui.sidebar'])
  })

  it('registers a sidebar panel with id builtin.outline', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createOutlinePlugin(vi.fn()))
    expect(services.panels.has('builtin.outline')).toBe(true)
    expect(services.panels.get('builtin.outline')!.title).toBe('Outline')
  })

  it('deactivation disposes the panel', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createOutlinePlugin(vi.fn()))
    await host.deactivate('builtin.outline')
    expect(services.panels.size).toBe(0)
  })
})
