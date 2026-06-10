// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  projectConfigOf,
  sanitizeProjectConfig
} from '@/stores/settingsStore'

describe('project config helpers', () => {
  describe('sanitizeProjectConfig', () => {
    it('keeps valid fields', () => {
      expect(sanitizeProjectConfig({ scheduleEnabled: false, scheduleDir: 'Daily' })).toEqual({
        scheduleEnabled: false,
        scheduleDir: 'Daily'
      })
    })

    it('trims scheduleDir and drops blank values', () => {
      expect(sanitizeProjectConfig({ scheduleDir: '  Notes  ' })).toEqual({ scheduleDir: 'Notes' })
      expect(sanitizeProjectConfig({ scheduleDir: '   ' })).toEqual({})
    })

    it('ignores wrong types and junk', () => {
      expect(sanitizeProjectConfig({ scheduleEnabled: 'yes', scheduleDir: 5 })).toEqual({})
      expect(sanitizeProjectConfig(null)).toEqual({})
      expect(sanitizeProjectConfig('nope')).toEqual({})
      expect(sanitizeProjectConfig({ foo: 'bar' })).toEqual({})
    })
  })

  describe('projectConfigOf', () => {
    it('extracts only the project-persisted settings', () => {
      expect(projectConfigOf({ scheduleEnabled: true, scheduleDir: '日程' })).toEqual({
        scheduleEnabled: true,
        scheduleDir: '日程'
      })
    })
  })

  describe('applyProjectConfig', () => {
    beforeEach(() => {
      useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
    })

    it('overrides in-memory settings without persisting to localStorage', () => {
      const before = localStorage.getItem('margin.settings')
      useSettingsStore.getState().applyProjectConfig({ scheduleEnabled: false, scheduleDir: 'X' })
      const s = useSettingsStore.getState()
      expect(s.scheduleEnabled).toBe(false)
      expect(s.scheduleDir).toBe('X')
      // applyProjectConfig must NOT write the machine-wide default.
      expect(localStorage.getItem('margin.settings')).toBe(before)
    })

    it('applies a partial without clobbering untouched fields', () => {
      useSettingsStore.getState().applyProjectConfig({ scheduleDir: 'Only' })
      const s = useSettingsStore.getState()
      expect(s.scheduleDir).toBe('Only')
      expect(s.scheduleEnabled).toBe(true)
    })
  })
})
