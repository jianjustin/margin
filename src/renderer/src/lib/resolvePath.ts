/** True for URLs that load directly (not vault-relative paths). */
export function isExternal(url: string): boolean {
  return /^(https?:|data:|asset:|mailto:)/i.test(url)
}

/**
 * Resolve a markdown-relative target (image src / link href) against the
 * directory of the containing document. Returns an absolute filesystem path,
 * or null when there is no document path to resolve against.
 */
export function resolveRelative(target: string, docPath: string | null): string | null {
  if (!docPath) return null
  let t = target
  try {
    t = decodeURIComponent(target)
  } catch {
    /* keep raw on malformed escapes */
  }
  if (t.startsWith('/')) return normalize(t)
  const baseDir = docPath.includes('/') ? docPath.replace(/\/[^/]*$/, '') : ''
  return normalize(baseDir + '/' + t)
}

function normalize(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}
