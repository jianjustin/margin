import { useDocumentStore } from '@/stores/documentStore'

type WriteFile = (path: string, content: string) => Promise<void>
type ReadFile = (path: string) => Promise<string>

const savingPaths = new Set<string>()

/**
 * Persist a document tab to disk. Saves are coalesced per path, so writes for
 * unrelated tabs may proceed while repeated saves for the same path converge.
 */
export async function saveDocument(
  writeFile: WriteFile,
  readFile?: ReadFile,
  targetPath?: string
): Promise<void> {
  const store = useDocumentStore
  const path = targetPath ?? store.getState().activePath
  if (!path || savingPaths.has(path)) return

  let tab = store.getState().tabForPath(path)
  if (!tab || tab.content === tab.savedContent || tab.conflict != null) return

  savingPaths.add(path)
  try {
    while (true) {
      tab = store.getState().tabForPath(path)
      if (!tab || tab.content === tab.savedContent || tab.conflict != null) break

      if (readFile) {
        const disk = await readFile(path).catch(() => null)
        tab = store.getState().tabForPath(path)
        if (!tab || tab.content === tab.savedContent || tab.conflict != null) break
        if (disk != null && disk !== tab.savedContent && disk !== tab.content) {
          store.getState().setConflict(path, disk)
          break
        }
        if (disk != null && disk === tab.content) {
          store.getState().markSaved(tab.content, path)
          continue
        }
      }

      const { content } = tab
      store.getState().markSaving(path)
      await writeFile(path, content)
      store.getState().markSaved(content, path)
    }
  } catch (err) {
    console.error('Failed to save document:', err)
    store.getState().markError(path)
  } finally {
    savingPaths.delete(path)
  }
}
