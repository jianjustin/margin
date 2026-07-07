import { useEffect } from 'react'

/**
 * Registers a Tauri v2 drag-drop listener that yields absolute system paths.
 *
 * Non-Tauri guard: `getCurrentWebview().onDragDropEvent` is only available
 * inside a Tauri runtime. In the browser / `pnpm demo` environment the dynamic
 * import itself succeeds (the package is bundled) but the call to
 * `getCurrentWebview()` throws "Not in a Tauri environment". We catch that at
 * the `Promise` level so the hook is a silent no-op in the browser — the
 * existing HTML5 `drop` handler in Editor.tsx covers that case.
 */
export function useTauriFileDrop(
  onDropPaths: (paths: string[], position: { x: number; y: number }) => void
): void {
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | null = null

    const register = async (): Promise<void> => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            onDropPaths(event.payload.paths, event.payload.position)
          }
        })
        const fn = await unlistenPromise
        if (cancelled) {
          fn()
        } else {
          unlisten = fn
        }
      } catch {
        // Not running inside Tauri — silently skip; HTML5 handlers remain active.
      }
    }

    void register()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [onDropPaths])
}
