import { useEffect, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { findBacklinksInDocs, markdownFilesInTree, type BacklinkResult } from '@/lib/backlinks'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../../../shared/ipc'

interface BacklinksPanelProps {
  width: number
  onOpenFile: (node: TreeNode) => void
}

export function BacklinksPanel({ width, onOpenFile }: BacklinksPanelProps): JSX.Element {
  const currentPath = useDocumentStore((s) => s.path)
  const tree = useVaultStore((s) => s.tree)
  const [items, setItems] = useState<BacklinkResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!currentPath) {
      setItems([])
      return
    }

    const files = markdownFilesInTree(tree)
    setLoading(true)
    Promise.all(
      files.map(async (file) => ({
        path: file.path,
        content: await api.readFile(file.path).catch(() => '')
      }))
    )
      .then((docs) => {
        if (!cancelled) setItems(findBacklinksInDocs(docs, currentPath))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentPath, tree])

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]"
    >
      <div className="flex h-[34px] items-center gap-2 border-b border-[color:var(--border-soft)] px-3 text-[12px] font-medium text-[color:var(--text-dim)]">
        <Link2 size={14} className="text-[color:var(--accent)]" />
        <span className="flex-1">双链</span>
        {loading && <Loader2 size={13} className="animate-spin text-[color:var(--text-faint)]" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!loading && items.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-[color:var(--text-faint)]">
            暂无反向链接
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.path}
                type="button"
                title={item.path}
                onClick={() => onOpenFile({ name: item.label, path: item.path, type: 'file' })}
                className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)]"
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="rounded border border-[color:var(--border-soft)] px-1.5 py-0.5 text-[10px] tabular-nums text-[color:var(--text-faint)]">
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
