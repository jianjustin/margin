import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface InputDialogProps {
  title: string
  /** Pre-filled value (e.g. the old name when renaming). */
  defaultValue?: string
  placeholder?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * A modal text-input dialog that replaces `window.prompt()` (which is a no-op
 * in Electron). Auto-focuses the input and selects the text-before-extension.
 */
export function InputDialog({
  title,
  defaultValue = '',
  placeholder,
  onConfirm,
  onCancel
}: InputDialogProps): JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Select the "name" portion before the last `.ext`, so renaming keeps the
    // extension but highlights only the base name.
    const dot = defaultValue.lastIndexOf('.')
    if (dot > 0) {
      el.setSelectionRange(0, dot)
    } else {
      el.select()
    }
  }, [defaultValue])

  const handleClose = useCallback(() => onCancel(), [onCancel])

  const submit = (): void => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Modal open onClose={handleClose} width={340}>
      <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
        <div className="text-[13px] font-semibold">{title}</div>
      </div>

      <div className="px-4 py-3">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={!value.trim()}>
          确认
        </Button>
      </div>
    </Modal>
  )
}
