import { isImagePath } from '@/lib/fileKinds'

/**
 * Returns the markdown text to insert when a vault-relative path is dropped
 * into the editor.
 *
 * - image path  → `![name](relPath)`
 * - `.md` path  → `[[name]]`   (wiki link)
 * - other       → `[name](relPath)`
 *
 * @param relPath  vault-relative path (e.g. "notes/foo.md", "assets/img.png")
 */
export function insertTextForVaultPath(relPath: string): string {
  const filename = relPath.split('/').pop() ?? relPath
  if (isImagePath(relPath)) {
    const name = filename.replace(/\.[^.]+$/, '')
    return `![${name}](${relPath})`
  }
  if (/\.md$/i.test(relPath)) {
    const name = filename.replace(/\.md$/i, '')
    return `[[${name}]]`
  }
  const name = filename
  return `[${name}](${relPath})`
}
