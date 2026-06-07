import { describe, it, expect } from 'vitest'
import {
  parseTable,
  serializeTable
} from '../src/renderer/src/editor/livePreview/tableModel'

describe('tableModel', () => {
  const md = ['| A | B |', '| :-- | --: |', '| 1 | 2 |', '| 3 | 4 |'].join('\n')

  it('parses header, alignment, rows', () => {
    const m = parseTable(md)
    expect(m.header).toEqual(['A', 'B'])
    expect(m.align).toEqual(['left', 'right'])
    expect(m.rows).toEqual([
      ['1', '2'],
      ['3', '4']
    ])
  })

  it('round-trips to normalized markdown', () => {
    const m = parseTable(md)
    const out = serializeTable(m)
    expect(parseTable(out)).toEqual(m)
  })

  it('handles escaped pipes in cells', () => {
    const m = parseTable('| a |\n| --- |\n| x \\| y |')
    expect(m.rows[0][0]).toBe('x | y')
    expect(serializeTable(m)).toContain('x \\| y')
  })

  it('defaults alignment to null when no colons', () => {
    const m = parseTable('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(m.align).toEqual([null, null])
  })
})
