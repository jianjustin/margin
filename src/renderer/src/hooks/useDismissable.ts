import { useEffect, type RefObject } from 'react'

/**
 * 模块级 LIFO 挂载栈。
 *
 * - mount 时 push 自身 token；unmount 时移除。
 * - Esc 触发时仅栈顶实例调用 onClose（后开先关）。
 * - 使用 Symbol per effect call 作为 token，天然支持 React StrictMode 双挂载：
 *   StrictMode 会 mount→cleanup→mount，每次 mount 产生新 Symbol；
 *   cleanup 移除旧 Symbol；最终栈中只有最后一次 mount 的 token，行为正确。
 * - enabled=false 的实例不入栈，不干扰分层。
 */
const escStack: symbol[] = []

/**
 * Esc + (optional) outside-click dismissal, shared by all overlays.
 *
 * Esc 采用 LIFO 栈分层：后挂载的浮层先关闭（后开先关）。
 * @param onClose 关闭回调
 * @param outsideOf 可选的参考元素——当 mousedown 发生在其外部时触发 onClose
 * @param enabled 是否启用监听（默认 true）。为 false 时不会注册任何事件监听器，也不入栈
 */
export function useDismissable(
  onClose: () => void,
  outsideOf?: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return

    // 每次 effect 调用产生唯一 token（支持 StrictMode 双挂载）
    const token = Symbol()
    escStack.push(token)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // 仅栈顶实例响应
        if (escStack[escStack.length - 1] === token) {
          onClose()
        }
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
      // 从栈中移除自身 token（从末尾向前找，支持中间关闭的情况）
      const idx = escStack.lastIndexOf(token)
      if (idx !== -1) escStack.splice(idx, 1)
    }
  }, [onClose, outsideOf, enabled])
}
