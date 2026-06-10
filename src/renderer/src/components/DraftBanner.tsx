import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

/** Banner offering to restore a crash-recovery draft found on file open. */
export function DraftBanner(): JSX.Element | null {
  const pending = useDocumentStore((s) => s.pendingDraft)
  if (pending == null) return null

  const discard = (): void => {
    const { path } = useDocumentStore.getState()
    const root = useVaultStore.getState().root
    useDocumentStore.getState().setPendingDraft(null)
    if (root && path) void api.deleteDraft(root, path).catch(() => {})
  }

  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--border-soft)] bg-[color:var(--accent-soft)] px-4 py-1.5 text-[12.5px]">
      <span className="flex-1 text-[color:var(--text-dim)]">
        检测到未保存的草稿（可能由意外退出产生）
      </span>
      <button
        className="rounded-md px-2 py-0.5 font-medium text-[color:var(--accent)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => useDocumentStore.getState().applyDraft()}
      >
        恢复草稿
      </button>
      <button
        className="rounded-md px-2 py-0.5 text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
        onClick={discard}
      >
        丢弃
      </button>
    </div>
  )
}
