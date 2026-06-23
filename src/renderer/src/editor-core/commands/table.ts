import { parseTable, serializeTable } from '@/editor/livePreview/tableModel'

export { parseTable, serializeTable, deleteTableRow } from '@/editor/livePreview/tableModel'
export type { TableModel, Align } from '@/editor/livePreview/tableModel'

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
