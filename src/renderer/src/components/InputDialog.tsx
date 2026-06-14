import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const submit = (): void => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

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
          <input
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
            className="w-full rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-[color:var(--accent-line)]"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[color:var(--accent-ink)] disabled:opacity-40"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
