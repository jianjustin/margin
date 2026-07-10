// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

const BOTH_ENABLED = ['builtin.outline', 'builtin.schedule']

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ enabledPlugins: BOTH_ENABLED, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
})

beforeEach(() => {
  useSettingsStore.setState({ enabledPlugins: BOTH_ENABLED, scheduleDir: '日程' })
})

describe('usePluginHost', () => {
  it('activates the outline plugin before the schedule plugin (tab order)', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const ids = usePluginUiStore.getState().sidebarPanels.map((p) => p.descriptor.id)
    expect(ids).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('activates only the outline plugin when builtin.schedule is not in enabledPlugins', async () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline'] })
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('activates only the schedule plugin when builtin.outline is not in enabledPlugins', async () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.schedule'] })
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.schedule')
  })

  it('deactivates the schedule plugin (outline stays) when builtin.schedule is removed from enabledPlugins', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
    })

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('deactivates the outline plugin (schedule stays) when builtin.outline is removed from enabledPlugins', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.outline', false)
    })

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.schedule')
  })

  it('unmounting the hook deactivates both plugins (no leaked panels)', async () => {
    const { unmount } = renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)
    await act(async () => {
      unmount()
      await new Promise((resolve) => queueMicrotask(resolve))
    })
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })
})
