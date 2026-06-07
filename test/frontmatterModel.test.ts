import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  serializeFrontmatter
} from '../src/renderer/src/editor/livePreview/frontmatterModel'

describe('frontmatterModel', () => {
  const src = [
    '---',
    'title: Hello',
    'tags:',
    '  - a',
    '  - b',
    'done: true',
    'count: 3',
    'date: 2026-06-07',
    '---'
  ].join('\n')

  it('parses fields with inferred types', () => {
    const f = parseFrontmatter(src)
    const byKey = Object.fromEntries(f.map((x) => [x.key, x]))
    expect(byKey.title.type).toBe('text')
    expect(byKey.title.value).toBe('Hello')
    expect(byKey.tags.type).toBe('list')
    expect(byKey.tags.value).toEqual(['a', 'b'])
    expect(byKey.done.type).toBe('checkbox')
    expect(byKey.done.value).toBe(true)
    expect(byKey.count.type).toBe('number')
    expect(byKey.count.value).toBe(3)
    expect(byKey.date.type).toBe('date')
  })

  it('preserves key order on round-trip', () => {
    const f = parseFrontmatter(src)
    const out = serializeFrontmatter(f)
    const f2 = parseFrontmatter(out)
    expect(f2.map((x) => x.key)).toEqual(['title', 'tags', 'done', 'count', 'date'])
  })

  it('returns empty array when no frontmatter', () => {
    expect(parseFrontmatter('# just a heading')).toEqual([])
  })

  it('serializes a list field back to YAML', () => {
    const out = serializeFrontmatter([{ key: 'tags', type: 'list', value: ['x', 'y'] }])
    expect(out).toContain('tags:')
    expect(parseFrontmatter(out)[0].value).toEqual(['x', 'y'])
  })
})
