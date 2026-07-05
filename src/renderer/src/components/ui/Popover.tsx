import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDismissable } from '@/hooks/useDismissable'

export interface PopoverProps {
  anchor: { x: number; y: number }
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * 通用定位浮层原语（坐标锚定）。
 *
 * 使用说明：
 * - 消费方应用 useCallback 稳定 onClose，避免不必要的 effect 重注册。
 * - 多个浮层同时挂载时，Esc 会同时关闭所有——嵌套场景由消费方避免。
 */
export function Popover({ anchor, onClose, className, children }: PopoverProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissable(onClose, rootRef)

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed z-50 rounded-[var(--radius-popover)] border border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-[var(--shadow-popover)]',
        className
      )}
      style={{ left: anchor.x, top: anchor.y, animation: 'pop-in 0.12s ease' }}
    >
      {children}
    </div>
  )
}
