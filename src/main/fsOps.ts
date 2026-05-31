import { mkdir, rename, writeFile, access } from 'fs/promises'
import { join, dirname, extname } from 'path'
import { shell } from 'electron'

/** Find a non-colliding path by appending -1, -2, … before the extension. */
async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let candidate = join(dir, name)
  let n = 1
  for (;;) {
    try {
      await access(candidate)
      candidate = join(dir, `${base}-${n}${ext}`)
      n += 1
    } catch {
      return candidate // does not exist → free to use
    }
  }
}

function assertSafeName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) {
    throw new Error('Invalid name')
  }
}

/** Create a new markdown note in `dir`; `.md` is appended if missing. Returns the path. */
export async function createNote(dir: string, name: string): Promise<string> {
  assertSafeName(name)
  const fileName = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`
  const path = await uniquePath(dir, fileName)
  await writeFile(path, '', 'utf-8')
  return path
}

/** Create a new folder in `dir`. Returns the path. */
export async function createFolder(dir: string, name: string): Promise<string> {
  assertSafeName(name)
  const path = await uniquePath(dir, name)
  await mkdir(path, { recursive: false })
  return path
}

/** Rename a file/folder within its directory. Returns the new path. */
export async function renamePath(oldPath: string, newName: string): Promise<string> {
  assertSafeName(newName)
  const dir = dirname(oldPath)
  const hadMd = /\.(md|markdown)$/i.test(oldPath)
  const finalName = hadMd && !/\.(md|markdown)$/i.test(newName) ? `${newName}.md` : newName
  const newPath = join(dir, finalName)
  await rename(oldPath, newPath)
  return newPath
}

/** Move a file/folder to the OS trash (never a hard delete). */
export async function trashPath(path: string): Promise<void> {
  await shell.trashItem(path)
}
