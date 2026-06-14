export type Align = 'left' | 'center' | 'right' | null

export interface TableModel {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** Split a `|`-delimited markdown row into trimmed cells, honoring `\|` escapes. */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|'
      i++
    } else if (ch === '|') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  // Drop empty leading/trailing cells produced by surrounding pipes.
  if (cells.length && cells[0].trim() === '') cells.shift()
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

function parseAlign(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

export function parseTable(source: string): TableModel {
  const lines = source.split('\n').filter((l) => l.trim() !== '')
  const header = splitRow(lines[0] ?? '')
  const align = splitRow(lines[1] ?? '').map(parseAlign)
  const rows = lines.slice(2).map(splitRow)
  return { header, align, rows }
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function delimCell(a: Align): string {
  switch (a) {
    case 'left':
      return ':---'
    case 'right':
      return '---:'
    case 'center':
      return ':---:'
    default:
      return '---'
  }
}

export function serializeTable(m: TableModel): string {
  const cols = m.header.length
  const row = (cells: string[]): string =>
    '| ' + Array.from({ length: cols }, (_, i) => escapeCell(cells[i] ?? '')).join(' | ') + ' |'
  const delim =
    '| ' + Array.from({ length: cols }, (_, i) => delimCell(m.align[i] ?? null)).join(' | ') + ' |'
  return [row(m.header), delim, ...m.rows.map(row)].join('\n')
}

/**
 * Returns new GFM table markdown with the data row at `rowIndex` removed.
 * Deleting the last data row yields a header-only table (still valid GFM).
 */
export function deleteTableRow(source: string, rowIndex: number): string {
  const model = parseTable(source)
  const rows = [...model.rows]
  rows.splice(rowIndex, 1)
  return serializeTable({ header: model.header, align: model.align, rows })
}
