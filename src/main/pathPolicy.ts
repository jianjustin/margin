const PROTECTED_SEGMENTS = new Set(['.obsidian', '.trash', '.git'])

/**
 * Returns false if `p` is empty or any path segment exactly matches a
 * protected Obsidian-vault directory (`.obsidian`, `.trash`, `.git`).
 * Splits on both `/` and `\` so it works for paths from either platform.
 */
export function isSafePath(p: string): boolean {
  if (!p) return false
  for (const seg of p.split(/[/\\]/)) {
    if (PROTECTED_SEGMENTS.has(seg)) return false
  }
  return true
}

export function assertSafePath(p: string): void {
  if (!isSafePath(p)) {
    throw new Error(`Path is in a protected Obsidian directory: ${p}`)
  }
}
