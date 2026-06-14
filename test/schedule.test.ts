import { describe, it, expect } from 'vitest'
import {
  formatDateKey,
  scheduleFileName,
  parseDateKeyFromName,
  collectScheduleDates
} from '@/lib/schedule'
import type { TreeNode } from '../src/shared/ipc'

describe('formatDateKey', () => {
  it('formats local date as YYYY-MM-DD with zero padding', () => {
    expect(formatDateKey(new Date(2026, 5, 7))).toBe('2026-06-07')
    expect(formatDateKey(new Date(2026, 11, 25))).toBe('2026-12-25')
  })

  it('scheduleFileName appends .md', () => {
    expect(scheduleFileName(new Date(2026, 0, 1))).toBe('2026-01-01.md')
  })
})

describe('parseDateKeyFromName', () => {
  it('extracts the date key from a schedule filename', () => {
    expect(parseDateKeyFromName('2026-06-07.md')).toBe('2026-06-07')
    expect(parseDateKeyFromName('2026-06-07.markdown')).toBe('2026-06-07')
  })

  it('returns null for non-date filenames', () => {
    expect(parseDateKeyFromName('notes.md')).toBeNull()
    expect(parseDateKeyFromName('2026-06.md')).toBeNull()
    expect(parseDateKeyFromName('2026-06-07.txt')).toBeNull()
  })
})

describe('collectScheduleDates', () => {
  const tree: TreeNode[] = [
    {
      name: '日程',
      path: '/v/日程',
      type: 'folder',
      children: [
        { name: '2026-06-07.md', path: '/v/日程/2026-06-07.md', type: 'file' },
        { name: '2026-06-08.md', path: '/v/日程/2026-06-08.md', type: 'file' },
        { name: 'readme.md', path: '/v/日程/readme.md', type: 'file' }
      ]
    },
    {
      name: 'Plans',
      path: '/v/Plans',
      type: 'folder',
      children: [
        {
          name: '日程',
          path: '/v/Plans/日程',
          type: 'folder',
          children: [
            { name: '2026-06-14.md', path: '/v/Plans/日程/2026-06-14.md', type: 'file' },
            {
              name: 'archive',
              path: '/v/Plans/日程/archive',
              type: 'folder',
              children: [
                { name: '2026-06-15.md', path: '/v/Plans/日程/archive/2026-06-15.md', type: 'file' }
              ]
            }
          ]
        }
      ]
    },
    { name: 'other.md', path: '/v/other.md', type: 'file' }
  ]

  it('collects date keys from the configured schedule folder', () => {
    const dates = collectScheduleDates(tree, '日程')
    expect(dates.has('2026-06-07')).toBe(true)
    expect(dates.has('2026-06-08')).toBe(true)
    expect(dates.size).toBe(2)
  })

  it('returns an empty set when the folder is absent', () => {
    expect(collectScheduleDates(tree, 'Schedule').size).toBe(0)
  })

  it('collects date keys from a nested schedule folder path', () => {
    const dates = collectScheduleDates(tree, 'Plans/日程')
    expect(dates.has('2026-06-14')).toBe(true)
    expect(dates.has('2026-06-15')).toBe(false)
    expect(dates.size).toBe(1)
  })

  it('normalizes whitespace and slashes in schedule folder paths', () => {
    const dates = collectScheduleDates(tree, ' /Plans\\日程/ ')
    expect(dates.has('2026-06-14')).toBe(true)
  })
})
