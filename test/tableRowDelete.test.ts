// test/tableRowDelete.test.ts
import { describe, it, expect } from 'vitest'
import { deleteTableRow } from '@/editor/livePreview/tableModel'

const TABLE_MD = [
  '| A | B |',
  '| :-- | --: |',
  '| r1a | r1b |',
  '| r2a | r2b |',
  '| r3a | r3b |',
].join('\n')

describe('deleteTableRow', () => {
  it('deletes the first data row (index 0)', () => {
    const result = deleteTableRow(TABLE_MD, 0)
    expect(result).not.toContain('r1a')
    expect(result).toContain('r2a')
    expect(result).toContain('r3a')
  })

  it('deletes the last data row (index 2)', () => {
    const result = deleteTableRow(TABLE_MD, 2)
    expect(result).toContain('r1a')
    expect(result).toContain('r2a')
    expect(result).not.toContain('r3a')
  })

  it('deletes a middle data row (index 1)', () => {
    const result = deleteTableRow(TABLE_MD, 1)
    expect(result).toContain('r1a')
    expect(result).not.toContain('r2a')
    expect(result).toContain('r3a')
  })

  it('produces a header-only table when the only data row is deleted', () => {
    const oneRow = ['| A | B |', '| --- | --- |', '| only | row |'].join('\n')
    const result = deleteTableRow(oneRow, 0)
    expect(result).toContain('| A | B |')
    expect(result).not.toContain('only')
  })
})
