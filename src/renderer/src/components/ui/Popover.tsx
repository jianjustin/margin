import React, { forwardRef, useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDismissable } from '@/hooks/useDismissable'

export interface PopoverProps {
  anchor: { x: number; y: number }
  onClose: () => void
  className?: string
  children: ReactNode
  /** 传递给根 div 的 ARIA role（如 "menu"），默认无 */
  role?: string
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>
}

/**
 * 通用定位浮层原语（坐标锚定）。
 *
 * 使用说明：
 * - 消费方应用 useCallback 稳定 onClose，避免不必要的 effect 重注册。
 * - Esc 按 LIFO 栈分层：后挂载的浮层先关闭。
 * - onClose 由捕获阶段 mousedown 触发；若触发按钮位于 Popover 外部，需在按钮的 mousedown 中 stopPropagation，否则会先关后开造成闪烁。
 * - 渲染后会通过 useLayoutEffect 测量自身 rect，若超出视口右/下缘则 clamp（不翻转）。
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  { anchor, onClose, className, children, role, onContextMenu },
  forwardedRef
) {
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissable(onClose, rootRef)

  // 视口防溢出 clamp
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - 8
    const maxTop = window.innerHeight - rect.height - 8
    if (anchor.x > maxLeft) {
      el.style.left = `${Math.max(0, maxLeft)}px`
    }
    if (anchor.y > maxTop) {
      el.style.top = `${Math.max(0, maxTop)}px`
    }
  }, [anchor.x, anchor.y])

  // 合并 forwardedRef 和 rootRef
  function setRefs(el: HTMLDivElement | null): void {
    ;(rootRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (typeof forwardedRef === 'function') {
      forwardedRef(el)
    } else if (forwardedRef) {
      ;(forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    }
  }

  return (
    <div
      ref={setRefs}
      role={role}
      onContextMenu={onContextMenu}
      className={cn(
        'fixed z-50 rounded-[var(--radius-popover)] border border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-[var(--shadow-popover)]',
        className
      )}
      style={{ left: anchor.x, top: anchor.y, animation: 'pop-in 0.12s ease' }}
    >
      {children}
    </div>
  )
})
