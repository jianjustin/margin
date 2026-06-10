import { useDocumentStore, type SaveStatus } from '@/stores/documentStore'
import { useDocStats } from '@/hooks/useDocStats'

interface StatusBarProps {
  hasFile: boolean
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '保存中…',
  dirty: '未保存',
  error: '保存失败'
}

/**
 * Subscribes to the document store itself (rather than receiving content via
 * props) so that per-keystroke content changes re-render only this tiny footer
 * — never App and the file-tree subtree. Word-count stats stay debounced.
 */
export function StatusBar({ hasFile }: StatusBarProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)
  const stats = useDocStats(content)
  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-4 border-t border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-4 text-[11.5px] text-[color:var(--text-faint)]"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {hasFile && (
        <span className="font-medium text-[color:var(--text-dim)] before:mr-[7px] before:align-[2px] before:text-[7px] before:text-[color:var(--accent)] before:content-['◆']">
          正文
        </span>
      )}
      <span className="flex-1" />
      <span>{stats.chars} 字符</span>
      <span>{stats.words} 词</span>
      <span>约 {stats.minutes} 分钟</span>
      {hasFile && (
        <span className={saveStatus === 'error' ? 'text-[color:var(--red)]' : 'text-[color:var(--accent)]'}>
          {SAVE_LABEL[saveStatus]}
        </span>
      )}
    </footer>
  )
}
