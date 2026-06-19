// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  projectConfigOf,
  sanitizeProjectConfig
} from '@/stores/settingsStore'
import { normalizeHiddenFolderRules } from '@/lib/folderRules'

describe('project config helpers', () => {
  describe('hidden folder rules', () => {
    it('normalizes names and relative paths', () => {
      expect(normalizeHiddenFolderRules([' .claude ', '/Projects/archive/', 'A\\B', '', '.claude'])).toEqual([
        '.claude',
        'Projects/archive',
        'A/B'
      ])
    })

    it('drops built-in hidden folders from user rules', () => {
      expect(normalizeHiddenFolderRules(['.margin', '.obsidian', '.git', '.trash', '.claude'])).toEqual([
        '.claude'
      ])
    })
  })

  describe('sanitizeProjectConfig', () => {
    it('keeps valid fields', () => {
      expect(sanitizeProjectConfig({
        scheduleEnabled: false,
        scheduleDir: 'Daily',
        hiddenFolders: [' .claude ', 'Projects/archive']
      })).toEqual({
        scheduleEnabled: false,
        scheduleDir: 'Daily',
        hiddenFolders: ['.claude', 'Projects/archive']
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
      expect(projectConfigOf({
        scheduleEnabled: true,
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })).toEqual({
        scheduleEnabled: true,
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })
    })
  })

  describe('applyProjectConfig', () => {
    beforeEach(() => {
      useSettingsStore.setState({
        scheduleEnabled: true,
        scheduleDir: '日程',
        hiddenFolders: [],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })
    })

    it('overrides in-memory settings without persisting to localStorage', () => {
      const before = localStorage.getItem('margin.settings')
      useSettingsStore.getState().applyProjectConfig({
        scheduleEnabled: false,
        scheduleDir: 'X',
        hiddenFolders: ['.claude']
      })
      const s = useSettingsStore.getState()
      expect(s.scheduleEnabled).toBe(false)
      expect(s.scheduleDir).toBe('X')
      expect(s.hiddenFolders).toEqual(['.claude'])
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
