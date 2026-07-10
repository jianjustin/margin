// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
})

beforeEach(() => {
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
})

describe('usePluginHost', () => {
  it('activates the schedule plugin (registers its sidebar panel) when scheduleEnabled is true', async () => {
    const onOpenToday = vi.fn()
    renderHook(() => usePluginHost(onOpenToday))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.some((p) => p.descriptor.id === 'builtin.schedule')).toBe(true)
  })

  it('deactivates the schedule plugin (panel disappears) when scheduleEnabled flips to false', async () => {
    const onOpenToday = vi.fn()
    renderHook(() => usePluginHost(onOpenToday))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })

    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })

  it('does not activate when scheduleEnabled starts false', async () => {
    useSettingsStore.setState({ scheduleEnabled: false })
    renderHook(() => usePluginHost(vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })

  it('unmounting the hook deactivates the plugin (no leaked panel)', async () => {
    const { unmount } = renderHook(() => usePluginHost(vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)
    await act(async () => {
      unmount()
      // dispose() defers the nested root's unmount() past the microtask
      // boundary (see usePluginHost.ts) — flush that microtask inside act()
      // so the deferred unmount is also tracked, not just the sync part.
      await new Promise((resolve) => queueMicrotask(resolve))
    })
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })
})
