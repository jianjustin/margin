// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'

/**
 * End-to-end integration coverage for P5.2/P5.3/P5.4: exercises the real
 * `usePluginHost` + real `schedulePlugin`/`outlinePlugin` + real
 * `OutlineDrawer`/`PanelSlot` together, which no single task's own tests do.
 */
function Harness({
  onOpenToday,
  onJumpToLine
}: {
  onOpenToday: (date: Date) => void
  onJumpToLine: (line: number) => void
}): JSX.Element {
  usePluginHost(onOpenToday, onJumpToLine)
  return <OutlineDrawer width={280} />
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(resolve))
  })
}

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
  useDocumentStore.getState().reset()
})

describe('plugin host + OutlineDrawer integration (real schedule + outline plugins)', () => {
  it('shows the real outline panel by default and calls onJumpToLine through the real plugin', async () => {
    useDocumentStore.getState().openOrActivate('/v/a.md', '# Title\n\ntext')
    const onJumpToLine = vi.fn()

    render(<Harness onOpenToday={vi.fn()} onJumpToLine={onJumpToLine} />)
    await act(async () => {})

    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()

    fireEvent.click(screen.getByText('Title'))
    expect(onJumpToLine).toHaveBeenCalledWith(0)
  })

  it('reparents the real ScheduleCalendarPanel into visible DOM, then falls back to the real Outline panel cleanly on deactivate', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })

    render(<Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />)
    await act(async () => {})

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()

    fireEvent.click(tab)
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()
    expect(screen.getByLabelText('上个月')).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels[0].descriptor.id).toBe('builtin.outline')

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('survives StrictMode double-activate/cleanup for both plugins without a "plugin already active" error or an orphaned tab', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })

    render(
      <React.StrictMode>
        <Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />
      </React.StrictMode>
    )
    await act(async () => {})
    await flushMicrotasks()

    expect(screen.getAllByRole('button', { name: 'Outline' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: 'Schedule' }).length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
