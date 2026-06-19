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
  const t = decodeTarget(target)
  if (t.startsWith('/')) return normalize(t)
  const baseDir = docPath.includes('/') ? docPath.replace(/\/[^/]*$/, '') : ''
  return normalize(baseDir + '/' + t)
}

/**
 * Resolve rendered markdown media targets. Links under the configured vault
 * asset directory are vault-root-relative because Margin's paste/drop import
 * inserts `assets/name.png` no matter which folder the note lives in.
 */
export function resolveMarkdownAsset(
  target: string,
  docPath: string | null,
  vaultRoot: string | null,
  assetsDir: string
): string | null {
  const t = decodeTarget(target)
  const dir = assetsDir.trim().replace(/^\/+|\/+$/g, '')
  if (vaultRoot && dir && (t === dir || t.startsWith(`${dir}/`))) {
    return normalize(`${vaultRoot}/${t}`)
  }
  return resolveRelative(target, docPath)
}

function decodeTarget(target: string): string {
  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
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
