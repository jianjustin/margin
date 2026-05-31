// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTheme } from '@/stores/themeStore'

// Mirrors the App effect: dark = no attribute, light = data-theme="light".
function applyTheme(mode: 'auto' | 'light' | 'dark', systemDark: boolean): void {
  const effective = resolveTheme(mode, systemDark)
  const root = document.documentElement
  if (effective === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
}

afterEach(() => document.documentElement.removeAttribute('data-theme'))

describe('theme application to <html>', () => {
  it('light mode sets data-theme="light"', () => {
    applyTheme('light', false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('dark mode removes data-theme', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    applyTheme('dark', true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('auto follows the system signal', () => {
    applyTheme('auto', true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false) // dark
    applyTheme('auto', false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
