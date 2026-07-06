import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { clampPaneWidth, persistPaneWidth, type PaneSpec } from '@/lib/layout'

/** Signature of the pointer-down handler returned by {@link usePaneResize}. */
export type StartPaneResize = (
  e: ReactPointerEvent,
  spec: PaneSpec,
  initialWidth: number,
  setWidth: (width: number) => void,
  direction: 1 | -1
) => void

/**
 * Pane-divider drag-to-resize. Returns a stable `startPaneResize` handler to
 * wire onto a separator's `onPointerDown`: it tracks the pointer, live-updates
 * the pane width (clamped), and on release persists the final width.
 *
 * Pure DOM manipulation — no App-level state — so it lives outside the render
 * body. Behavior preserved exactly from the App.tsx handler this replaces.
 */
export function usePaneResize(): StartPaneResize {
  return useCallback(
    (e, spec, initialWidth, setWidth, direction): void => {
      e.preventDefault()
      const startX = e.clientX
      const previousUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'

      function move(ev: PointerEvent): void {
        const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
        setWidth(next)
      }

      function up(ev: PointerEvent): void {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = previousUserSelect
        const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
        setWidth(persistPaneWidth(spec, next))
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    []
  )
}
