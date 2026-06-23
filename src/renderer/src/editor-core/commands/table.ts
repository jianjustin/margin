import { parseTable, serializeTable, type Align } from '@/editor/livePreview/tableModel'

export { parseTable, serializeTable, deleteTableRow } from '@/editor/livePreview/tableModel'
export type { TableModel, Align } from '@/editor/livePreview/tableModel'

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi)

/**
 * Return new GFM table markdown with a blank data row inserted *after*
 * `afterIndex` (use `-1` to prepend before the first data row). The new row has
 * one empty cell per header column. Out-of-range indices clamp to the ends.
 */
export function insertTableRow(source: string, afterIndex: number): string {
  const model = parseTable(source)
  const rows = [...model.rows]
  const at = Math.min(Math.max(afterIndex + 1, 0), rows.length)
  rows.splice(at, 0, model.header.map(() => ''))
  return serializeTable({ header: model.header, align: model.align, rows })
}

/**
 * Return new GFM table markdown with a blank column inserted *after*
 * `afterIndex` (use `-1` to prepend). Out-of-range indices clamp to the ends.
 */
export function insertTableColumn(source: string, afterIndex: number): string {
  const model = parseTable(source)
  const at = clamp(afterIndex + 1, 0, model.header.length)
  const header = [...model.header]
  const align = [...model.align]
  header.splice(at, 0, '')
  align.splice(at, 0, null)
  const rows = model.rows.map((r) => {
    const cells = [...r]
    cells.splice(at, 0, '')
    return cells
  })
  return serializeTable({ header, align, rows })
}

/**
 * Return new GFM table markdown with the column at `colIndex` removed. A no-op
 * when it would empty the table (single remaining column) or the index is out
 * of range.
 */
export function deleteTableColumn(source: string, colIndex: number): string {
  const model = parseTable(source)
  if (colIndex < 0 || colIndex >= model.header.length || model.header.length <= 1) return source
  const header = model.header.filter((_, i) => i !== colIndex)
  const align = model.align.filter((_, i) => i !== colIndex)
  const rows = model.rows.map((r) => r.filter((_, i) => i !== colIndex))
  return serializeTable({ header, align, rows })
}

/** Return new GFM table markdown with the alignment of column `colIndex` set. */
export function setColumnAlign(source: string, colIndex: number, align: Align): string {
  const model = parseTable(source)
  if (colIndex < 0 || colIndex >= model.header.length) return source
  const aligns = [...model.align]
  aligns[colIndex] = align
  return serializeTable({ header: model.header, align: aligns, rows: model.rows })
}

/**
 * Build a fresh GFM table skeleton: a `Column N` header, left-default alignment,
 * and `rows` empty data rows of `cols` columns each.
 */
export function createTable(rows: number, cols: number): string {
  const n = Math.max(1, cols)
  const r = Math.max(0, rows)
  const header = Array.from({ length: n }, (_, i) => `Column ${i + 1}`)
  const align: Align[] = Array.from({ length: n }, () => null)
  const dataRows = Array.from({ length: r }, () => Array.from({ length: n }, () => ''))
  return serializeTable({ header, align, rows: dataRows })
}
