import { describe, it, expect } from 'vitest'
import { resolveTheme } from '@/stores/themeStore'

describe('resolveTheme', () => {
  it('auto + system dark → dark', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
  })
  it('auto + system light → light', () => {
    expect(resolveTheme('auto', false)).toBe('light')
  })
  it('explicit dark ignores system', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('explicit light ignores system', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })
})
