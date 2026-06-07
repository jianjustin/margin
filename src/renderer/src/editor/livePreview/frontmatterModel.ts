import yaml from 'js-yaml'

export type FmType = 'text' | 'list' | 'checkbox' | 'number' | 'date'

export interface FmField {
  key: string
  type: FmType
  value: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Normalize a parsed YAML date back to a `YYYY-MM-DD` string. */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function inferType(value: unknown): FmType {
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  if (value instanceof Date) return 'date'
  if (typeof value === 'string' && DATE_RE.test(value)) return 'date'
  return 'text'
}

/** Extract the YAML body between the leading `---` fences, or null. */
function frontmatterBody(source: string): string | null {
  const lines = source.split('\n')
  if (lines[0] !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return lines.slice(1, i).join('\n')
  }
  return null
}

export function parseFrontmatter(source: string): FmField[] {
  const body = frontmatterBody(source)
  if (body === null) return []
  let data: unknown
  try {
    data = yaml.load(body)
  } catch {
    return []
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => {
    const type = inferType(value)
    // Store dates as plain ISO strings so the date <input> and YAML round-trip.
    const normalized = value instanceof Date ? dateToIso(value) : value
    return { key, type, value: normalized }
  })
}

export function serializeFrontmatter(fields: FmField[]): string {
  const obj: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.key.trim() === '') continue
    obj[f.key] = f.value
  }
  // sortKeys:false preserves insertion (field) order; lineWidth:-1 avoids wrapping.
  const body = yaml.dump(obj, { sortKeys: false, lineWidth: -1 }).trimEnd()
  return `---\n${body}\n---`
}
