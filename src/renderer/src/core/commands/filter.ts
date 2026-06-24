import type { CommandDef } from './registry'

/**
 * Case-insensitive subsequence match: are all characters of `query` found in
 * `text` in order? Returns a score (lower = tighter match) or -1 for no match.
 * Used by the command palette / slash menu to rank entries.
 */
export function subsequenceScore(text: string, query: string): number {
  if (query === '') return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  let score = 0
  let lastHit = -1
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    const found = t.indexOf(ch, ti)
    if (found === -1) return -1
    if (lastHit >= 0) score += found - lastHit - 1 // penalize gaps
    lastHit = found
    ti = found + 1
  }
  return score
}

/**
 * Filter + rank commands by a palette query against title (and category). An
 * empty query returns all visible commands in registration order.
 */
export function filterCommands<Ctx>(
  commands: readonly CommandDef<Ctx>[],
  query: string
): CommandDef<Ctx>[] {
  const visible = commands.filter((c) => c.visible !== false)
  if (query.trim() === '') return visible

  const scored: { cmd: CommandDef<Ctx>; score: number; idx: number }[] = []
  visible.forEach((cmd, idx) => {
    const haystack = cmd.category ? `${cmd.category} ${cmd.title}` : cmd.title
    const score = subsequenceScore(haystack, query.trim())
    if (score >= 0) scored.push({ cmd, score, idx })
  })
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx)
  return scored.map((s) => s.cmd)
}
