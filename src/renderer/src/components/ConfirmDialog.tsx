import { useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

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
  const handleClose = useCallback(() => onCancel(), [onCancel])

  return (
    <Modal open onClose={handleClose} width={340}>
      <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
        <div className="text-[13px] font-semibold">{title}</div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] text-[color:var(--text-dim)]">{message}</p>
      </div>

      <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
