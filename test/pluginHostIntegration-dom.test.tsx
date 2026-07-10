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
 * End-to-end integration coverage for P5.2: exercises the real
 * `usePluginHost` + real `schedulePlugin` + real `OutlineDrawer`/`PanelSlot`
 * together, which no existing test does (`usePluginHost.test.tsx` never
 * mounts `OutlineDrawer`, so the panel's container is never reparented into
 * visible DOM; `outlineDrawer-dom.test.tsx` only ever registers a fake stub
 * panel, bypassing `usePluginHost`'s real dispose path).
 */
function Harness({ onOpenToday }: { onOpenToday: (date: Date) => void }): JSX.Element {
  usePluginHost(onOpenToday)
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
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
  useDocumentStore.getState().reset()
})

describe('plugin host + OutlineDrawer integration (real schedule plugin)', () => {
  it('reparents the real ScheduleCalendarPanel into visible DOM, then falls back to Outline cleanly on deactivate', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })

    render(<Harness onOpenToday={vi.fn()} />)
    await act(async () => {})

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()

    fireEvent.click(tab)
    // The calendar header ("YYYY 年 M 月") is unique to the real
    // ScheduleCalendarPanel — unlike a fake stub, this proves the actual
    // plugin panel was reparented into visible DOM by PanelSlot.
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()
    expect(screen.getByLabelText('上个月')).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('survives StrictMode double-activate/cleanup without a "plugin already active" error or an orphaned tab', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })

    render(
      <React.StrictMode>
        <Harness onOpenToday={vi.fn()} />
      </React.StrictMode>
    )
    await act(async () => {})
    await flushMicrotasks()

    // StrictMode double-invokes effects; there must be exactly one tab / one
    // registered panel, not a duplicate.
    expect(screen.getAllByRole('button', { name: 'Schedule' }).length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
