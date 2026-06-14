import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A modal confirm dialog that replaces `window.confirm()`. Supports a
 * danger variant (red confirm button) for destructive operations.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0_0_0/0.4)]"
      onClick={onCancel}
    >
      <div
        className="w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
          <div className="text-[13px] font-semibold">{title}</div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[13px] text-[color:var(--text-dim)]">{message}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={[
              'rounded-md px-3 py-1.5 text-[12.5px] font-medium',
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[color:var(--accent)] text-[color:var(--accent-ink)]'
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
