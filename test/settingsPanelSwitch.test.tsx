// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/SettingsPanel'

vi.mock('@/hooks/useUpdater', () => ({
  useUpdater: () => ({
    status: { state: 'idle', currentVersion: '2.4.0' },
    busy: false,
    check: vi.fn(),
    install: vi.fn()
  })
}))

describe('SettingsPanel switches', () => {
  afterEach(cleanup)

  it('uses the shared app switch styling for all toggles', () => {
    render(<SettingsPanel tree={[]} onClose={() => {}} />)

    for (const sw of screen.getAllByRole('switch')) {
      expect(sw.className).toContain('app-switch')
      expect(sw.querySelector('.app-switch-thumb')).not.toBeNull()
    }
  })
})
