import { watch, type FSWatcher } from 'fs'

/**
 * Watch a vault root recursively and invoke `onChange` (debounced) on any
 * file-system event under it. Returns a stop function. macOS `fs.watch`
 * supports `recursive: true`.
 */
export function watchVault(root: string, onChange: () => void, debounceMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null

  try {
    watcher = watch(root, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    })
  } catch {
    // If watching fails (e.g. permissions), the app still works without live reload.
    watcher = null
  }

  return () => {
    if (timer) clearTimeout(timer)
    watcher?.close()
  }
}
