import { useDocumentStore } from '@/stores/documentStore'

/** Non-blocking banner shown when the open file was modified externally. */
export function ConflictBar(): JSX.Element | null {
  const conflict = useDocumentStore((s) => s.conflict)
  const path = useDocumentStore((s) => s.path)
  if (conflict == null) return null
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--border-soft)] bg-[color:var(--bg-hover)] px-4 py-1.5 text-[12.5px]">
      <span className="flex-1 text-[color:var(--text-dim)]">
        文件已在外部被修改
      </span>
      <button
        className="rounded-md px-2 py-0.5 font-medium text-[color:var(--accent)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => {
          if (path) useDocumentStore.getState().keepMine(path)
        }}
      >
        保留我的（下次保存覆盖）
      </button>
      <button
        className="rounded-md px-2 py-0.5 text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => {
          if (path) useDocumentStore.getState().takeDisk(path)
        }}
      >
        载入磁盘版本
      </button>
    </div>
  )
}
