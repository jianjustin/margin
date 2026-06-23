import { describe, it, expect } from 'vitest'
import { insertTableRow, deleteTableRow, parseTable } from '@/editor-core'

const TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n')

describe('insertTableRow', () => {
  it('inserts a blank row after the given data row', () => {
    const out = insertTableRow(TABLE, 0) // after first data row
    expect(parseTable(out).rows).toEqual([['1', '2'], ['', ''], ['3', '4']])
  })

  it('prepends a row with afterIndex -1', () => {
    const out = insertTableRow(TABLE, -1)
    expect(parseTable(out).rows).toEqual([['', ''], ['1', '2'], ['3', '4']])
  })

  it('clamps an out-of-range index to the end', () => {
    const out = insertTableRow(TABLE, 99)
    expect(parseTable(out).rows).toEqual([['1', '2'], ['3', '4'], ['', '']])
  })

  it('matches the header column count', () => {
    const out = insertTableRow(TABLE, 0)
    const model = parseTable(out)
    for (const row of model.rows) expect(row.length).toBe(model.header.length)
  })
})

describe('deleteTableRow (re-exported through editor-core)', () => {
  it('removes the addressed data row', () => {
    const out = deleteTableRow(TABLE, 0)
    expect(parseTable(out).rows).toEqual([['3', '4']])
  })
})
