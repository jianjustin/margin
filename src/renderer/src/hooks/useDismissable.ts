import { useEffect, type RefObject } from 'react'

/** Esc + (optional) outside-click dismissal, shared by all overlays. */
export function useDismissable(
  onClose: () => void,
  outsideOf?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent): void => {
      const el = outsideOf?.current
      if (el && !el.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    if (outsideOf) window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (outsideOf) window.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose, outsideOf])
}
