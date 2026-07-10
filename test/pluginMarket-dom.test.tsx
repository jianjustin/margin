// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginMarket } from '@/components/PluginMarket'
import { useSettingsStore } from '@/stores/settingsStore'

afterEach(() => {
  cleanup()
  useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'] })
})

describe('PluginMarket', () => {
  it('lists the real built-in plugins with their name, description, and permissions', () => {
    render(<PluginMarket onBack={() => {}} />)
    expect(screen.getByText('大纲')).toBeTruthy()
    expect(screen.getByText('日程')).toBeTruthy()
    expect(screen.getAllByText('侧边栏面板').length).toBe(2)
    expect(screen.getByText('命令')).toBeTruthy()
  })

  it('toggling a plugin off updates settingsStore.enabledPlugins', () => {
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: '关闭 日程' }))
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline'])
  })

  it('toggling a disabled plugin back on re-adds it to enabledPlugins', () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline'] })
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: '启用 日程' }))
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('filters the list by search query (name or description)', () => {
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('搜索插件...'), { target: { value: '日历' } })
    expect(screen.queryByText('大纲')).toBeNull()
    expect(screen.getByText('日程')).toBeTruthy()
  })

  it('calls onBack when the close button is clicked', () => {
    let closed = false
    render(<PluginMarket onBack={() => { closed = true }} />)
    fireEvent.click(screen.getByLabelText('关闭插件市场'))
    expect(closed).toBe(true)
  })
})
