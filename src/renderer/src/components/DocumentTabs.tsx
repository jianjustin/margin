import { X } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'

interface DocumentTabsProps {
  onActivate: (path: string) => void
  onClose: (path: string) => Promise<void>
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function DocumentTabs({ onActivate, onClose }: DocumentTabsProps): JSX.Element | null {
  const tabs = useDocumentStore((s) => s.tabs)
  const activePath = useDocumentStore((s) => s.activePath)

  if (tabs.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label="打开的文档"
      className="flex h-[34px] shrink-0 items-end gap-1 overflow-x-auto border-b border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-2 pt-1"
    >
      {tabs.map((tab) => {
        const name = fileName(tab.path)
        const active = tab.path === activePath
        const dirty = tab.content !== tab.savedContent
        return (
          <div
            key={tab.path}
            className={[
              'group flex h-[28px] max-w-[220px] min-w-[92px] items-center gap-1.5 rounded-t-md border px-2 text-left text-[12px] transition-colors',
              active
                ? 'border-[color:var(--border-soft)] border-b-[color:var(--bg)] bg-[color:var(--bg)] text-foreground'
                : 'border-transparent bg-transparent text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]'
            ].join(' ')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.path}
              onClick={() => onActivate(tab.path)}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {dirty && (
                <span
                  aria-label={`${name} 有未保存更改`}
                  className="h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--accent)]"
                />
              )}
            </button>
            <button
              type="button"
              aria-label={`关闭 ${name}`}
              onClick={(event) => {
                event.stopPropagation()
                void onClose(tab.path)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                void onClose(tab.path)
              }}
              className="grid h-[18px] w-[18px] flex-none place-items-center rounded text-[color:var(--text-faint)] opacity-70 transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
