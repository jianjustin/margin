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
      className="flex h-[30px] min-w-0 flex-1 items-center overflow-x-auto text-[12px] [-webkit-app-region:no-drag]"
    >
      {tabs.map((tab, index) => {
        const name = fileName(tab.path)
        const active = tab.path === activePath
        const dirty = tab.content !== tab.savedContent
        return (
          <div key={tab.path} className="flex min-w-0 items-center">
            {index > 0 && (
              <span
                data-testid="tab-arc-separator"
                aria-hidden
                className="mx-1 h-4 w-2 flex-none rounded-l-full border-l border-[color:var(--border-soft)] opacity-80"
              />
            )}
            <div
              className={[
                'group flex h-[26px] max-w-[220px] min-w-[72px] items-center gap-1 rounded-md px-1.5 text-left transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
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
                <span className={['min-w-0 flex-1 truncate', active ? 'font-medium' : ''].join(' ')}>
                  {name}
                </span>
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
                className={[
                  'grid h-[18px] w-[18px] flex-none place-items-center rounded text-[color:var(--text-faint)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground',
                  active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
                ].join(' ')}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
