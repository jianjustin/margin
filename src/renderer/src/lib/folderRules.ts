export const BUILT_IN_HIDDEN_FOLDERS = ['.margin', '.obsidian', '.git', '.trash'] as const

const builtInHiddenFolders = new Set<string>(BUILT_IN_HIDDEN_FOLDERS)

export function normalizeFolderPathInput(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
}

export function isBuiltInHiddenFolderRule(rule: string): boolean {
  const normalized = normalizeFolderPathInput(rule)
  return normalized !== '' && normalized.split('/').some((segment) => builtInHiddenFolders.has(segment))
}

export function normalizeHiddenFolderRules(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = normalizeFolderPathInput(value)
    if (!normalized || isBuiltInHiddenFolderRule(normalized)) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}
