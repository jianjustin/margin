import type { TreeNode } from '../../../shared/ipc'

export interface SearchResult {
  path: string
  name: string
  matchType: 'name' | 'content'
  snippet?: string
}

/** Recursively extract all markdown files from the vault tree. */
export function flattenMarkdownFiles(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      out.push(...flattenMarkdownFiles(node.children ?? []))
    } else if (/\.(md|markdown|mdx)$/i.test(node.name)) {
      out.push(node)
    }
  }
  return out
}

/** True when every character of `query` appears in `name` in order (fuzzy). */
function isFuzzyMatch(name: string, query: string): boolean {
  const n = name.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let ni = 0; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) qi++
  }
  return qi === q.length
}

/** Returns files whose base name (no extension) fuzzy-matches the query. */
export function matchByName(files: TreeNode[], query: string): SearchResult[] {
  if (!query.trim()) return []
  const baseName = (n: string): string => n.replace(/\.(md|markdown|mdx)$/i, '')
  return files
    .filter((f) => isFuzzyMatch(baseName(f.name), query))
    .map((f) => ({ path: f.path, name: f.name, matchType: 'name' as const }))
}

/**
 * Async full-text search: reads each file and returns matches with a snippet.
 * Capped at `limit` files to prevent freezing on large vaults.
 */
export async function matchByContent(
  files: TreeNode[],
  query: string,
  readFile: (path: string) => Promise<string>,
  signal?: AbortSignal,
  limit = 500
): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const lq = query.toLowerCase()
  const results = await Promise.all(
    files.slice(0, limit).map(async (f) => {
      try {
        if (signal?.aborted) return null
        const text = await readFile(f.path)
        if (signal?.aborted) return null
        const idx = text.toLowerCase().indexOf(lq)
        if (idx === -1) return null
        const start = Math.max(0, idx - 40)
        const end = Math.min(text.length, idx + query.length + 60)
        const snippet =
          (start > 0 ? '…' : '') +
          text.slice(start, end).replace(/\n/g, ' ') +
          (end < text.length ? '…' : '')
        return { path: f.path, name: f.name, matchType: 'content' as const, snippet }
      } catch {
        return null
      }
    })
  )
  return results.filter(<T,>(r: T | null): r is T => r !== null)
}
