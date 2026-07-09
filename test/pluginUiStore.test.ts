// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { usePluginUiStore } from '@/stores/pluginUiStore'

function makePanel(id: string) {
  return {
    descriptor: {
      id,
      title: id,
      icon: 'Calendar',
      render: () => () => {}
    },
    container: document.createElement('div')
  }
}

beforeEach(() => {
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

describe('pluginUiStore — sidebar panels', () => {
  it('starts empty', () => {
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([])
  })

  it('addSidebarPanel appends a panel', () => {
    const panel = makePanel('builtin.schedule')
    usePluginUiStore.getState().addSidebarPanel(panel)
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([panel])
  })

  it('removeSidebarPanel removes by id and leaves others untouched', () => {
    const a = makePanel('a')
    const b = makePanel('b')
    usePluginUiStore.getState().addSidebarPanel(a)
    usePluginUiStore.getState().addSidebarPanel(b)
    usePluginUiStore.getState().removeSidebarPanel('a')
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([b])
  })

  it('removeSidebarPanel on an unknown id is a no-op', () => {
    const a = makePanel('a')
    usePluginUiStore.getState().addSidebarPanel(a)
    usePluginUiStore.getState().removeSidebarPanel('nope')
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([a])
  })
})

describe('pluginUiStore — status items', () => {
  it('addStatusItem/removeStatusItem mirror the sidebar-panel behavior', () => {
    const item = { id: 's1', render: () => 'hi' }
    usePluginUiStore.getState().addStatusItem(item)
    expect(usePluginUiStore.getState().statusItems).toEqual([item])
    usePluginUiStore.getState().removeStatusItem('s1')
    expect(usePluginUiStore.getState().statusItems).toEqual([])
  })
})
