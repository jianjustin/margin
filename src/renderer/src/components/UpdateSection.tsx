import { Download, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '../../../shared/ipc'

interface UpdateSectionProps {
  status: UpdateStatus
  busy: boolean
  onCheck: () => Promise<void>
  onInstall: () => Promise<void>
}

function actionClass(primary = false): string {
  return [
    'inline-flex h-[30px] flex-none items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
    primary
      ? 'bg-[color:var(--accent)] text-[color:var(--accent-ink)]'
      : 'border border-[color:var(--border-soft)] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
  ].join(' ')
}

function statusText(status: UpdateStatus): string | null {
  switch (status.state) {
    case 'checking':
      return '正在检查…'
    case 'not-available':
      return '已是最新版本'
    case 'available':
      return `发现新版本 ${status.version}`
    case 'downloading':
      return status.percent != null ? `正在下载 ${status.percent}%` : '正在下载更新…'
    case 'installing':
      return '正在安装更新…'
    case 'error':
      return status.message
    case 'idle':
      return null
  }
}

export function UpdateSection({
  status,
  busy,
  onCheck,
  onInstall
}: UpdateSectionProps): JSX.Element {
  const text = statusText(status)
  const version = status.currentVersion || '...'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-foreground">版本 {version}</div>
          {text && (
            <div
              className={[
                'mt-1 break-words text-[11.5px]',
                status.state === 'error'
                  ? 'text-[color:var(--red)]'
                  : 'text-[color:var(--text-faint)]'
              ].join(' ')}
            >
              {text}
            </div>
          )}
        </div>

        {(status.state === 'idle' || status.state === 'not-available' || status.state === 'error') && (
          <button
            type="button"
            onClick={() => void onCheck()}
            disabled={busy}
            className={actionClass(false)}
          >
            <RefreshCw size={13} />
            {status.state === 'idle' ? '检查更新' : '重新检查'}
          </button>
        )}

        {status.state === 'checking' && (
          <button type="button" disabled className={actionClass(false)}>
            <RefreshCw size={13} />
            正在检查…
          </button>
        )}

        {status.state === 'available' && (
          <button
            type="button"
            onClick={() => void onInstall()}
            disabled={busy}
            className={actionClass(true)}
          >
            <Download size={13} />
            更新并重启
          </button>
        )}
      </div>

      {status.state === 'available' && status.body && (
        <div className="max-h-20 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[11.5px] text-[color:var(--text-dim)]">
          {status.body}
        </div>
      )}
    </div>
  )
}
