import type { DocStats } from '@/lib/computeStats'
import type { SaveStatus } from '@/stores/documentStore'

interface StatusBarProps {
  stats: DocStats
  saveStatus: SaveStatus
  hasFile: boolean
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '保存中…',
  dirty: '未保存',
  error: '保存失败'
}

export function StatusBar({ stats, saveStatus, hasFile }: StatusBarProps): JSX.Element {
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
