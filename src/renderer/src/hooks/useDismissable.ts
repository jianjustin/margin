import { useEffect, type RefObject } from 'react'

/**
 * Esc + (optional) outside-click dismissal, shared by all overlays.
 * @param onClose 关闭回调
 * @param outsideOf 可选的参考元素——当 mousedown 发生在其外部时触发 onClose
 * @param enabled 是否启用监听（默认 true）。为 false 时不会注册任何事件监听器
 */
export function useDismissable(
  onClose: () => void,
  outsideOf?: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return

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
  }, [onClose, outsideOf, enabled])
}
