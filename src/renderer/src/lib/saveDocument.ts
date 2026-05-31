import { useDocumentStore } from '@/stores/documentStore'

type WriteFile = (path: string, content: string) => Promise<void>

/**
 * In-flight guard. Only one save loop runs at a time; concurrent callers
 * (e.g. an autosave debounce firing alongside a manual Cmd-S) return early
 * and let the running loop pick up the latest content.
 */
let saving = false

/**
 * Persist the current document to disk.
 *
 * Guarantees a single write is in flight at any moment. If the content
 * changes while a write is running, the loop re-saves the newest content
 * before finishing, so the file always converges on what the user sees.
 * A failed write flips the store to an 'error' state and leaves the
 * document dirty so it can be retried by a later call.
 */
export async function saveDocument(writeFile: WriteFile): Promise<void> {
  const store = useDocumentStore
  if (saving) return
  if (!store.getState().path || !store.getState().isDirty()) return

  saving = true
  try {
    while (store.getState().isDirty()) {
      const { path, content } = store.getState()
      if (!path) break
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
