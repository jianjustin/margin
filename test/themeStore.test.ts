// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ mode: 'auto' })
})

describe('themeStore', () => {
  it('defaults to auto', () => {
    expect(useThemeStore.getState().mode).toBe('auto')
  })

  it('setMode updates and persists to localStorage', () => {
    useThemeStore.getState().setMode('dark')
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(localStorage.getItem('margin.themeMode')).toBe('dark')
  })

  it('cycleMode goes auto → light → dark → auto', () => {
    const { cycleMode } = useThemeStore.getState()
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('light')
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('dark')
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('auto')
  })
})
