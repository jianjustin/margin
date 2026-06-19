import { useDocumentStore } from '@/stores/documentStore'
import { emit } from '@tauri-apps/api/event'
import { windowId, EV_FILE_SAVED } from '@/lib/windowIdentity'

type WriteFile = (path: string, content: string) => Promise<void>
type ReadFile = (path: string) => Promise<string>

const savingPaths = new Map<string, Promise<void>>()

export function waitForDocumentSave(path: string): Promise<void> {
  return savingPaths.get(path) ?? Promise.resolve()
}

export async function waitForDocumentSaves(paths: string[]): Promise<void> {
  await Promise.all(Array.from(new Set(paths)).map((path) => waitForDocumentSave(path)))
}

/**
 * Persist a document tab to disk. Saves are coalesced per path, so writes for
 * unrelated tabs may proceed while repeated saves for the same path converge.
 */
export function saveDocument(
  writeFile: WriteFile,
  readFile?: ReadFile,
  targetPath?: string
): Promise<void> {
  const store = useDocumentStore
  const path = targetPath ?? store.getState().activePath
  if (!path || savingPaths.has(path)) return Promise.resolve()

  let tab = store.getState().tabForPath(path)
  if (!tab || tab.content === tab.savedContent || tab.conflict != null) return Promise.resolve()

  let resolveSave: () => void = () => {}
  const save = new Promise<void>((resolve) => {
    resolveSave = resolve
  })
  savingPaths.set(path, save)

  void (async () => {
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
        void emit(EV_FILE_SAVED, { path, content, _source: windowId })
      }
    } catch (err) {
      console.error('Failed to save document:', err)
      store.getState().markError(path)
    } finally {
      if (savingPaths.get(path) === save) savingPaths.delete(path)
      resolveSave()
    }
  })()

  return save
}
