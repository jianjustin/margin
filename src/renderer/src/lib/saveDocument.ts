import { useDocumentStore } from '@/stores/documentStore'

type WriteFile = (path: string, content: string) => Promise<void>
type ReadFile = (path: string) => Promise<string>

let saving = false

/**
 * Persist the current document to disk. Single write in flight; re-saves until
 * converged. When `readFile` is provided, the disk is checked before each
 * write — if it no longer matches the content we last loaded/saved, the write
 * is withheld and a conflict is raised instead (never silently overwrite an
 * external change). A pending conflict also pauses autosave entirely.
 */
export async function saveDocument(writeFile: WriteFile, readFile?: ReadFile): Promise<void> {
  const store = useDocumentStore
  if (saving) return
  if (!store.getState().path || !store.getState().isDirty()) return
  if (store.getState().conflict != null) return

  saving = true
  try {
    while (store.getState().isDirty() && store.getState().conflict == null) {
      const { path, content, savedContent } = store.getState()
      if (!path) break
      if (readFile) {
        const disk = await readFile(path).catch(() => null)
        if (disk != null && disk !== savedContent && disk !== content) {
          store.getState().setConflict(disk)
          break
        }
      }
      store.getState().markSaving()
      await writeFile(path, content)
      store.getState().markSaved(content)
    }
  } catch (err) {
    console.error('Failed to save document:', err)
    store.getState().markError()
  } finally {
    saving = false
  }
}
