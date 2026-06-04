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

/** Bottom status bar: counts on the left, block count + save status on the right. */
export function StatusBar({ stats, saveStatus, hasFile }: StatusBarProps): JSX.Element {
  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-4 text-[11.5px] text-[color:var(--text-faint)]"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <div className="flex items-center">
        <span>
          {stats.chars} 字符 · {stats.words} 词 · 约 {stats.minutes} 分钟
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>{stats.blocks} 块</span>
        {hasFile && (
          <span className={saveStatus === 'error' ? 'text-[color:var(--red)]' : 'text-[color:var(--accent)]'}>
            {SAVE_LABEL[saveStatus]}
          </span>
        )}
      </div>
    </footer>
  )
}
