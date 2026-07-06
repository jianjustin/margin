import type { PathPlan } from './types'

/**
 * Path segments Margin must never create, rename into, move into, or trash —
 * mirrors the Rust `pathPolicy::assertSafePath` guard so the renderer can refuse
 * unsafe operations before they ever reach IPC. Keeps the Obsidian-interop
 * north star (§0.3): never touch `.obsidian` / `.trash` / `.git`.
 */
export const UNSAFE_SEGMENTS = ['.obsidian', '.trash', '.git'] as const

const SEP = /[\\/]+/

/** Split a path into non-empty segments, tolerating both `/` and `\` separators. */
function segments(path: string): string[] {
  return path.split(SEP).filter((s) => s !== '' && s !== '.')
}

/** True when no segment of `path` is an unsafe (Obsidian/git internal) folder. */
export function isPathSafe(path: string): boolean {
  return !segments(path).some((s) => (UNSAFE_SEGMENTS as readonly string[]).includes(s))
}

/** Throw if the path crosses into an unsafe folder. */
export function assertSafePath(path: string): void {
  if (!isPathSafe(path)) throw new Error(`unsafe path: ${path}`)
}

/** The directory portion of a path (POSIX-style; `''` when there is none). */
export function dirname(path: string): string {
  const norm = path.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  return idx <= 0 ? (idx === 0 ? '/' : '') : norm.slice(0, idx)
}

/** The final component of a path. */
export function basename(path: string): string {
  const norm = path.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  return idx === -1 ? norm : norm.slice(idx + 1)
}

/** Join a directory and a name with a single `/`. */
export function joinPath(dir: string, name: string): string {
  if (dir === '') return name
  return `${dir.replace(/[\\/]+$/, '')}/${name}`
}

/** Split a filename into its stem and extension (incl. dot), e.g. `a.md` → [`a`, `.md`]. */
export function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return [name, '']
  return [name.slice(0, dot), name.slice(dot)]
}

/**
 * Resolve a desired name to one that does not collide with `existing` (sibling
 * names), appending `-1`, `-2`, … before the extension. Mirrors the Rust
 * `uniquePath` behavior so rename/move never clobbers.
 */
export function uniqueName(existing: Iterable<string>, desired: string): string {
  const taken = new Set(existing)
  if (!taken.has(desired)) return desired
  const [stem, ext] = splitExt(desired)
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Compute the target path of a rename (keeps the node in its current directory). */
export function renamePlan(path: string, newName: string): PathPlan {
  return { from: path, to: joinPath(dirname(path), newName) }
}

/** Compute the target path of a move into `destDir` (keeps the node's name). */
export function movePlan(path: string, destDir: string): PathPlan {
  return { from: path, to: joinPath(destDir, basename(path)) }
}

/** True if `child` is `parent` itself or nested anywhere under it. */
export function isSelfOrDescendant(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/')
}

/** Guard for drag-move: reject no-op, self, descendant and unsafe targets. */
export function canMoveInto(srcPath: string, destDir: string): boolean {
  if (!isPathSafe(srcPath) || !isPathSafe(destDir)) return false
  if (isSelfOrDescendant(srcPath, destDir)) return false
  return dirname(srcPath) !== destDir
}
