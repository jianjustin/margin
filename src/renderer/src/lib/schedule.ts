import type { TreeNode } from '../../../shared/ipc'

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local-time date key in `YYYY-MM-DD` form (not UTC — schedules are per local day). */
export function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** The schedule note filename for a date, e.g. `2026-06-07.md`. */
export function scheduleFileName(d: Date): string {
  return `${formatDateKey(d)}.md`
}

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.(md|markdown)$/i

/** Extract the `YYYY-MM-DD` key from a schedule filename, or null if it is not one. */
export function parseDateKeyFromName(name: string): string | null {
  const m = DATE_FILE_RE.exec(name)
  return m ? m[1] : null
}

/**
 * Collect the set of date keys (`YYYY-MM-DD`) that have a schedule note in the
 * configured schedule folder (a direct child of the vault root named `dir`).
 */
export function collectScheduleDates(tree: TreeNode[], dir: string): Set<string> {
  const dates = new Set<string>()
  const folder = tree.find((n) => n.type === 'folder' && n.name === dir)
  if (!folder?.children) return dates
  for (const child of folder.children) {
    if (child.type !== 'file') continue
    const key = parseDateKeyFromName(child.name)
    if (key) dates.add(key)
  }
  return dates
}

/** Seed content for a freshly-created daily schedule note. */
export function scheduleTemplate(d: Date): string {
  const key = formatDateKey(d)
  return `---
type: 日程
date: ${key}
---

# ${key} 日程

## 今日待办
- [ ]

## 记录
`
}
