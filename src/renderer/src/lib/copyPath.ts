export function projectRelativePath(root: string | null, path: string): string {
  if (!root) return path

  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedPath = path.replace(/\\/g, '/')

  if (normalizedPath === normalizedRoot) return ''
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return path

  return normalizedPath.slice(normalizedRoot.length + 1)
}
