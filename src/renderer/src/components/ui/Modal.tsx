import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useDismissable } from '@/hooks/useDismissable'

export interface ModalProps {
  open: boolean
  onClose: () => void
  width?: number
  /** 弹窗对齐方式。'center'（默认）垂直居中；'top' 顶部对齐，容器加 pt-[15vh] */
  align?: 'center' | 'top'
  children: ReactNode
}

/** 卡片内所有可聚焦元素的选择器 */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), details, summary'

/**
 * 通用模态弹窗原语。
 *
 * 使用说明：
 * - 消费方应用 useCallback 稳定 onClose，避免不必要的 effect 重注册。
 * - Esc 按 LIFO 栈分层：多个浮层叠加时后开先关。
 * - 包含 role="dialog"/aria-modal 语义、打开时焦点移入卡片、关闭时归还焦点、Tab 陷阱。
 */
export function Modal({ open, onClose, width, align = 'center', children }: ModalProps): JSX.Element | null {
  const cardRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<Element | null>(null)

  useDismissable(onClose, undefined, open)

  // 记录打开前的焦点，关闭时归还
  useLayoutEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement
      // 将焦点移入卡片
      cardRef.current?.focus()
    } else {
      // 归还焦点
      if (prevFocusRef.current instanceof HTMLElement) {
        prevFocusRef.current.focus()
      }
      prevFocusRef.current = null
    }
  }, [open])

  if (!open) return null

  const alignClass = align === 'top' ? 'items-start pt-[15vh]' : 'items-center'

  /** 简易 Tab 陷阱：在卡片内可聚焦元素间循环 */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return
    const card = cardRef.current
    if (!card) return
    const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('disabled')
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === card) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last || document.activeElement === card) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-[color:var(--overlay)] ${alignClass}`}
      onMouseDown={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="rounded-[var(--radius-modal)] border border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-[var(--shadow-modal)] outline-none"
        style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  )
}
