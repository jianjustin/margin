import { type ReactNode } from 'react'
import { useDismissable } from '@/hooks/useDismissable'

export interface ModalProps {
  open: boolean
  onClose: () => void
  width?: number
  /** 弹窗对齐方式。'center'（默认）垂直居中；'top' 顶部对齐，容器加 pt-[15vh] */
  align?: 'center' | 'top'
  children: ReactNode
}

/**
 * 通用模态弹窗原语。
 *
 * 使用说明：
 * - 消费方应用 useCallback 稳定 onClose，避免不必要的 effect 重注册。
 * - 多个浮层同时挂载时，Esc 会同时关闭所有——嵌套场景由消费方避免。
 */
export function Modal({ open, onClose, width, align = 'center', children }: ModalProps): JSX.Element | null {
  useDismissable(onClose, undefined, open)

  if (!open) return null

  const alignClass = align === 'top' ? 'items-start pt-[15vh]' : 'items-center'

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-[color:var(--overlay)] ${alignClass}`}
      onMouseDown={onClose}
    >
      <div
        className="rounded-[var(--radius-modal)] border border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-[var(--shadow-modal)]"
        style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
