import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search, Folder, Plus, Trash2 } from 'lucide-react'
import { UpdateSection } from '@/components/UpdateSection'
import { useUpdater } from '@/hooks/useUpdater'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TreeNode } from '../../../shared/ipc'

interface SettingsPanelProps {
  tree: TreeNode[]
  onClose: () => void
}

/* ── Folder picker with search ─────────────────────────────────── */

interface FolderPickerProps {
  value: string
  folders: string[]
  onChange: (dir: string) => void
}

function FolderPicker({ value, folders, onChange }: FolderPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!query) return folders
    const q = query.toLowerCase()
    return folders.filter((f) => f.toLowerCase().includes(q))
  }, [folders, query])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        className="flex w-full items-center gap-2 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2.5 py-1.5 text-left text-[12.5px] text-foreground hover:border-[color:var(--accent-line)]"
      >
        <Folder size={13} className="flex-none text-[color:var(--text-faint)]" />
        <span className="flex-1 truncate">{value}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-[color:var(--border-soft)] px-2 py-1.5">
            <Search size={12} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件夹…"
              autoFocus
              className="min-w-0 flex-1 border-none bg-transparent text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11.5px] text-[color:var(--text-faint)]">
                无匹配文件夹
              </div>
            ) : (
              filtered.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    onChange(f)
                    setOpen(false)
                  }}
                  className={[
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
                    f === value
                      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'text-foreground hover:bg-[color:var(--bg-hover)]'
                  ].join(' ')}
                >
                  <Folder size={13} className="flex-none" />
                  <span className="truncate">{f}</span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-[color:var(--border-soft)] p-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  onChange(query.trim())
                  setOpen(false)
                }
              }}
              placeholder="输入新文件夹名…"
              className="w-full rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────────── */

/** Extract top-level folder names from the vault tree. */
function topFolders(tree: TreeNode[]): string[] {
  return tree.filter((n) => n.type === 'folder').map((n) => n.name)
}

/* ── Main panel ─────────────────────────────────────────────────── */

export function SettingsPanel({ tree, onClose }: SettingsPanelProps): JSX.Element {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)
  const setScheduleEnabled = useSettingsStore((s) => s.setScheduleEnabled)
  const setScheduleDir = useSettingsStore((s) => s.setScheduleDir)
  const addHiddenFolder = useSettingsStore((s) => s.addHiddenFolder)
  const removeHiddenFolder = useSettingsStore((s) => s.removeHiddenFolder)
  const [hiddenInput, setHiddenInput] = useState('')
  const updater = useUpdater()

  const folders = useMemo(() => topFolders(tree), [tree])

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const sectionTitle = 'mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]'
  const rowClass = 'flex items-center justify-between gap-3 py-2'
  const labelClass = 'text-[13px] text-foreground'
  const descClass = 'text-[11.5px] text-[color:var(--text-faint)]'

  function submitHiddenFolder(): void {
    const value = hiddenInput.trim()
    if (!value) return
    addHiddenFolder(value)
    setHiddenInput('')
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0_0_0/0.4)]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--border-soft)] px-5 py-3.5">
          <span className="text-[14px] font-semibold">设置</span>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── 日程 ────────────────── */}
          <div className={sectionTitle}>日程</div>

          <div className={rowClass}>
            <div>
              <div className={labelClass}>启用日程功能</div>
              <div className={descClass}>在标题栏显示日程入口和日历</div>
            </div>
            <button
              role="switch"
              aria-checked={scheduleEnabled}
              onClick={() => setScheduleEnabled(!scheduleEnabled)}
              className={[
                'relative h-[22px] w-[40px] flex-none rounded-full transition-colors',
                scheduleEnabled ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--border)]'
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
                  scheduleEnabled ? 'translate-x-[20px]' : 'translate-x-[2px]'
                ].join(' ')}
              />
            </button>
          </div>

          {scheduleEnabled && (
            <div className="mt-1 pb-1">
              <div className={`${labelClass} mb-1.5`}>日程目录</div>
              <FolderPicker
                value={scheduleDir}
                folders={folders}
                onChange={setScheduleDir}
              />
              <div className={`${descClass} mt-1.5`}>
                每日日程笔记保存在此文件夹中（不存在时自动创建）
              </div>
            </div>
          )}

          {/* ── 文件库 ───────────────── */}
          <div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
            <div className={sectionTitle}>文件库</div>
            <div className={`${labelClass} mb-1.5`}>隐藏文件夹</div>
            <div className="flex items-center gap-2">
              <input
                value={hiddenInput}
                onChange={(e) => setHiddenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitHiddenFolder()
                }}
                placeholder=".claude 或 Projects/archive"
                className="min-w-0 flex-1 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
              />
              <button
                onClick={submitHiddenFolder}
                className="grid h-[30px] w-[30px] place-items-center rounded-md border border-[color:var(--border-soft)] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
                aria-label="添加隐藏文件夹"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className={`${descClass} mt-1.5`}>
              不含斜杠按文件夹名隐藏；含斜杠按文件库相对路径隐藏。
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {hiddenFolders.length === 0 ? (
                <div className={descClass}>未配置隐藏文件夹</div>
              ) : (
                hiddenFolders.map((rule) => (
                  <div
                    key={rule}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate font-[family-name:var(--mono)] text-[12px] text-[color:var(--text-dim)]">
                      {rule}
                    </span>
                    <button
                      onClick={() => removeHiddenFolder(rule)}
                      className="grid h-5 w-5 flex-none place-items-center rounded text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--red)]"
                      aria-label={`移除隐藏规则 ${rule}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── 关于 ───────────────── */}
          <div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
            <div className={sectionTitle}>关于</div>
            <UpdateSection
              status={updater.status}
              busy={updater.busy}
              onCheck={updater.check}
              onInstall={updater.install}
            />
            <div className={`${descClass} mt-2`}>
              本文件库的设置保存在 <code className="font-[family-name:var(--mono)]">.margin/config.json</code>，随文件库一起迁移。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
