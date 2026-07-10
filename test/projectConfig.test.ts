// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  projectConfigOf,
  sanitizeProjectConfig,
  migrateLegacyScheduleEnabled
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
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'Daily',
        hiddenFolders: [' .claude ', 'Projects/archive']
      })).toEqual({
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'Daily',
        hiddenFolders: ['.claude', 'Projects/archive']
      })
    })

    it('trims scheduleDir and drops blank values', () => {
      expect(sanitizeProjectConfig({ scheduleDir: '  Notes  ' })).toEqual({ scheduleDir: 'Notes' })
      expect(sanitizeProjectConfig({ scheduleDir: '   ' })).toEqual({})
    })

    it('ignores wrong types and junk', () => {
      expect(sanitizeProjectConfig({ enabledPlugins: 'yes', scheduleDir: 5 })).toEqual({})
      expect(sanitizeProjectConfig({ enabledPlugins: ['ok', 5] })).toEqual({})
      expect(sanitizeProjectConfig(null)).toEqual({})
      expect(sanitizeProjectConfig('nope')).toEqual({})
      expect(sanitizeProjectConfig({ foo: 'bar' })).toEqual({})
    })
  })

  describe('projectConfigOf', () => {
    it('extracts only the project-persisted settings', () => {
      expect(projectConfigOf({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })).toEqual({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })
    })
  })

  describe('migrateLegacyScheduleEnabled', () => {
    it('excludes builtin.schedule when the legacy field was false', () => {
      expect(migrateLegacyScheduleEnabled({ scheduleEnabled: false })).toEqual({
        enabledPlugins: ['builtin.outline']
      })
    })

    it('returns empty when the legacy field was true (defaults already include schedule)', () => {
      expect(migrateLegacyScheduleEnabled({ scheduleEnabled: true })).toEqual({})
    })

    it('returns empty when enabledPlugins is already present (new format, no migration needed)', () => {
      expect(migrateLegacyScheduleEnabled({
        scheduleEnabled: false,
        enabledPlugins: ['builtin.outline', 'builtin.schedule']
      })).toEqual({})
    })

    it('returns empty when there is no legacy field at all (fresh install)', () => {
      expect(migrateLegacyScheduleEnabled({})).toEqual({})
    })
  })

  describe('applyProjectConfig', () => {
    beforeEach(() => {
      useSettingsStore.setState({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
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
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'X',
        hiddenFolders: ['.claude']
      })
      const s = useSettingsStore.getState()
      expect(s.enabledPlugins).toEqual(['builtin.outline'])
      expect(s.scheduleDir).toBe('X')
      expect(s.hiddenFolders).toEqual(['.claude'])
      expect(localStorage.getItem('margin.settings')).toBe(before)
    })

    it('applies a partial without clobbering untouched fields', () => {
      useSettingsStore.getState().applyProjectConfig({ scheduleDir: 'Only' })
      const s = useSettingsStore.getState()
      expect(s.scheduleDir).toBe('Only')
      expect(s.enabledPlugins).toEqual(['builtin.outline', 'builtin.schedule'])
    })
  })
})
