// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { useDocumentStore } from '@/stores/documentStore'
import { usePluginUiStore } from '@/stores/pluginUiStore'

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

function registerFakePanel(id: string, title: string, marker: string): void {
  const container = document.createElement('div')
  container.textContent = marker
  usePluginUiStore.getState().addSidebarPanel({
    descriptor: { id, title, icon: 'Calendar', render: () => () => {} },
    container
  })
}

describe('OutlineDrawer — outline tab (always present)', () => {
  it('shows the outline heading list by default', () => {
    useDocumentStore.getState().openOrActivate('/v/a.md', '# Title\n\ntext')
    render(<OutlineDrawer width={280} />)
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()
  })
})

describe('OutlineDrawer — dynamic plugin panel tabs', () => {
  it('renders a tab per registered sidebar panel and mounts its container when selected', () => {
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()
    fireEvent.click(tab)

    expect(screen.getByText('schedule-marker')).toBeTruthy()
  })

  it('falls back to the outline tab when the active panel is unregistered', () => {
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()

    act(() => {
      usePluginUiStore.getState().removeSidebarPanel('builtin.schedule')
    })

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
  })
})
