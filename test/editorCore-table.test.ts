import { describe, it, expect } from 'vitest'
import {
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  setColumnAlign,
  createTable,
  parseTable
} from '@/editor-core'

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

describe('insertTableColumn', () => {
  it('inserts a blank column after the given index', () => {
    const model = parseTable(insertTableColumn(TABLE, 0))
    expect(model.header).toEqual(['A', '', 'B'])
    expect(model.rows).toEqual([['1', '', '2'], ['3', '', '4']])
  })

  it('prepends a column with afterIndex -1', () => {
    expect(parseTable(insertTableColumn(TABLE, -1)).header).toEqual(['', 'A', 'B'])
  })
})

describe('deleteTableColumn', () => {
  it('removes the addressed column', () => {
    const model = parseTable(deleteTableColumn(TABLE, 0))
    expect(model.header).toEqual(['B'])
    expect(model.rows).toEqual([['2'], ['4']])
  })

  it('refuses to empty the last column', () => {
    const oneCol = createTable(1, 1)
    expect(deleteTableColumn(oneCol, 0)).toBe(oneCol)
  })
})

describe('setColumnAlign', () => {
  it('sets the alignment of a column', () => {
    expect(parseTable(setColumnAlign(TABLE, 1, 'center')).align).toEqual([null, 'center'])
  })
})

describe('createTable', () => {
  it('builds a header + N empty rows of M columns', () => {
    const model = parseTable(createTable(2, 3))
    expect(model.header).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect(model.rows).toEqual([['', '', ''], ['', '', '']])
  })

  it('clamps to at least one column', () => {
    expect(parseTable(createTable(0, 0)).header).toEqual(['Column 1'])
  })
})
