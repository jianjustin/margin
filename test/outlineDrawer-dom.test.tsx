// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { usePluginUiStore } from '@/stores/pluginUiStore'

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

function registerFakePanel(id: string, title: string, marker: string): void {
  const container = document.createElement('div')
  container.textContent = marker
  usePluginUiStore.getState().addSidebarPanel({
    descriptor: { id, title, icon: 'List', render: () => () => {} },
    container
  })
}

describe('OutlineDrawer — generic plugin panel host', () => {
  it('renders no tabs when no panels are registered', () => {
    render(<OutlineDrawer width={280} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('defaults to the first registered panel and mounts its container', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    render(<OutlineDrawer width={280} />)
    expect(screen.getByText('outline-marker')).toBeTruthy()
  })

  it('renders a tab per registered panel and switches between them', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)

    expect(screen.getByText('outline-marker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()
  })

  it('falls back to the first remaining panel when the active one is unregistered', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()

    act(() => {
      usePluginUiStore.getState().removeSidebarPanel('builtin.schedule')
    })

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('outline-marker')).toBeTruthy()
  })
})
