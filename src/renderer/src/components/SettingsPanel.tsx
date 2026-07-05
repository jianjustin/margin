import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { FolderGlyph } from '@/components/icons/FolderGlyph'
import { PluginMarket } from '@/components/PluginMarket'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UpdateSection } from '@/components/UpdateSection'
import { useUpdater } from '@/hooks/useUpdater'
import { useSettingsStore } from '@/stores/settingsStore'
import { Modal } from '@/components/ui/Modal'
import { ICON_SM, ICON_MD } from '@/components/ui/icon'
import type { TreeNode } from '../../../shared/ipc'

interface SettingsPanelProps {
  tree: TreeNode[]
  onClose: () => void
}

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
        className="flex w-full items-center gap-2 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-2.5 py-1.5 text-left text-[12.5px] text-foreground hover:border-[color:var(--accent-line)]"
      >
        <FolderGlyph size={ICON_MD} />
        <span className="flex-1 truncate">{value}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[var(--shadow-dropdown)]">
          <div className="flex items-center gap-1.5 border-b border-[color:var(--border-soft)] px-2 py-1.5">
            <Search size={ICON_SM} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件夹..."
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
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                    f === value
                      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'text-foreground hover:bg-[color:var(--bg-hover)]'
                  ].join(' ')}
                >
                  <FolderGlyph size={ICON_MD} />
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
              placeholder="输入新文件夹名..."
              className="w-full rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function topFolders(tree: TreeNode[]): string[] {
  return tree.filter((n) => n.type === 'folder').map((n) => n.name)
}

interface AppSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

function AppSwitch({ checked, onChange, label }: AppSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={['app-switch', checked ? 'app-switch-on' : 'app-switch-off'].join(' ')}
    >
      <span className="app-switch-thumb" />
    </button>
  )
}

type SettingsTab = 'general' | 'editor' | 'sync' | 'shortcuts' | 'advanced'

const NAV_ITEMS: { id: SettingsTab | 'plugins'; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'sync', label: 'Sync' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'advanced', label: 'Advanced' }
]

export function SettingsPanel({ tree, onClose }: SettingsPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [pluginMarketOpen, setPluginMarketOpen] = useState(false)

  // Modal 的 Esc/遮罩点击都走这里；pluginMarket 打开时优先关 pluginMarket
  const handleClose = useCallback(() => {
    if (pluginMarketOpen) {
      setPluginMarketOpen(false)
    } else {
      onClose()
    }
  }, [pluginMarketOpen, onClose])

  return (
    <Modal open onClose={handleClose}>
      <div
        className="flex h-[520px] w-[680px] max-w-[calc(100vw-32px)] overflow-hidden"
      >
        <div className="flex w-[160px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
          <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
            设置
          </div>
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                if (id === 'plugins') {
                  setPluginMarketOpen(true)
                  return
                }
                setActiveTab(id)
              }}
              className={[
                'mx-2 flex items-center rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
                activeTab === id
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)]'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="mx-3 mt-2 rounded-xl px-3 py-1.5 text-[12px] text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          {activeTab === 'general' && <GeneralTab tree={tree} />}
          {activeTab === 'editor' && <EditorTab />}
          {(activeTab === 'sync' || activeTab === 'shortcuts' || activeTab === 'advanced') && (
            <div className="flex flex-1 items-center justify-center text-[13px] text-[color:var(--text-faint)]">
              即将推出
            </div>
          )}
        </div>
      </div>

      {pluginMarketOpen && <PluginMarket onBack={() => setPluginMarketOpen(false)} />}
    </Modal>
  )
}

function GeneralTab({ tree }: { tree: TreeNode[] }): JSX.Element {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)
  const assetsDir = useSettingsStore((s) => s.assetsDir)
  const plantUmlServerUrl = useSettingsStore((s) => s.plantUmlServerUrl)
  const diagramFitWidth = useSettingsStore((s) => s.diagramFitWidth)
  const mathEnabled = useSettingsStore((s) => s.mathEnabled)
  const setScheduleEnabled = useSettingsStore((s) => s.setScheduleEnabled)
  const setScheduleDir = useSettingsStore((s) => s.setScheduleDir)
  const addHiddenFolder = useSettingsStore((s) => s.addHiddenFolder)
  const removeHiddenFolder = useSettingsStore((s) => s.removeHiddenFolder)
  const setAssetsDir = useSettingsStore((s) => s.setAssetsDir)
  const setPlantUmlServerUrl = useSettingsStore((s) => s.setPlantUmlServerUrl)
  const setDiagramFitWidth = useSettingsStore((s) => s.setDiagramFitWidth)
  const setMathEnabled = useSettingsStore((s) => s.setMathEnabled)
  const updater = useUpdater()
  const [hiddenInput, setHiddenInput] = useState('')
  const folders = useMemo(() => topFolders(tree), [tree])

  const sectionTitle = 'mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)] first:mt-0'
  const rowClass = 'flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] py-2.5 last:border-b-0'
  const labelClass = 'text-[13px] text-foreground'
  const descClass = 'mt-0.5 text-[11.5px] text-[color:var(--text-faint)]'

  function submitHiddenFolder(): void {
    const value = hiddenInput.trim()
    if (!value) return
    addHiddenFolder(value)
    setHiddenInput('')
  }

  return (
    <div>
      <div className={sectionTitle}>Appearance</div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Theme</div>
          <div className={descClass}>Match the editor to your environment</div>
        </div>
        <ThemeToggle />
      </div>

      <div className={sectionTitle}>日程</div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>启用日程功能</div>
          <div className={descClass}>在设置中管理日程入口和日历</div>
        </div>
        <AppSwitch checked={scheduleEnabled} onChange={setScheduleEnabled} label="启用日程功能" />
      </div>
      {scheduleEnabled && (
        <div className="pb-2 pt-1">
          <div className={`${labelClass} mb-1.5`}>日程目录</div>
          <FolderPicker value={scheduleDir} folders={folders} onChange={setScheduleDir} />
          <div className={`${descClass} mt-1.5`}>每日日程笔记保存在此文件夹中（不存在时自动创建）</div>
        </div>
      )}

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
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
        />
        <button
          onClick={submitHiddenFolder}
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[color:var(--border-soft)] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
          aria-label="添加隐藏文件夹"
        >
          <Plus size={ICON_SM} />
        </button>
      </div>
      <div className={`${descClass} mt-1.5`}>不含斜杠按文件夹名隐藏；含斜杠按文件库相对路径隐藏。</div>
      <div className="mt-2 flex flex-col gap-1">
        {hiddenFolders.length === 0 ? (
          <div className={descClass}>未配置隐藏文件夹</div>
        ) : (
          hiddenFolders.map((rule) => (
            <div key={rule} className="flex items-center gap-2 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--mono)] text-[12px] text-[color:var(--text-dim)]">{rule}</span>
              <button
                onClick={() => removeHiddenFolder(rule)}
                className="grid h-5 w-5 flex-none place-items-center rounded-md text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--red)]"
                aria-label={`移除隐藏规则 ${rule}`}
              >
                <Trash2 size={ICON_SM} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={sectionTitle}>富内容</div>
      <div className={`${labelClass} mb-1.5`}>图片资产目录</div>
      <input
        value={assetsDir}
        onChange={(e) => setAssetsDir(e.target.value)}
        placeholder="assets"
        className="w-full rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
      />
      <div className={`${descClass} mt-1.5`}>拖拽或粘贴图片时复制到此文件库相对目录。</div>
      <div className="mt-3">
        <div className={`${labelClass} mb-1.5`}>图表渲染服务</div>
        <input
          value={plantUmlServerUrl}
          onChange={(e) => setPlantUmlServerUrl(e.target.value)}
          placeholder="https://kroki.io"
          className="w-full rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
        />
        <div className={`${descClass} mt-1.5`}>PlantUML 和 DOT 使用 Kroki 兼容接口；Mermaid 本地渲染。</div>
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>图表自适应宽度</div>
          <div className={descClass}>关闭后保留原始尺寸并横向滚动</div>
        </div>
        <AppSwitch checked={diagramFitWidth} onChange={setDiagramFitWidth} label="图表自适应宽度" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>数学公式</div>
          <div className={descClass}>使用 KaTeX 渲染行内和块级 LaTeX</div>
        </div>
        <AppSwitch checked={mathEnabled} onChange={setMathEnabled} label="数学公式" />
      </div>

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
  )
}

function EditorTab(): JSX.Element {
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [showMarkdownSyntax, setShowMarkdownSyntax] = useState(true)
  const [spellcheck, setSpellcheck] = useState(false)

  const sectionTitle = 'mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)] first:mt-0'
  const rowClass = 'flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] py-2.5 last:border-b-0'
  const labelClass = 'text-[13px] text-foreground'
  const descClass = 'mt-0.5 text-[11.5px] text-[color:var(--text-faint)]'

  return (
    <div>
      <div className={sectionTitle}>Editor</div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Typewriter mode</div>
          <div className={descClass}>Keep the current line centered</div>
        </div>
        <AppSwitch checked={typewriterMode} onChange={setTypewriterMode} label="Typewriter mode" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Show markdown syntax</div>
          <div className={descClass}>Reveal markdown markers on the active line</div>
        </div>
        <AppSwitch checked={showMarkdownSyntax} onChange={setShowMarkdownSyntax} label="Show markdown syntax" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Spellcheck</div>
          <div className={descClass}>Underline misspelled words</div>
        </div>
        <AppSwitch checked={spellcheck} onChange={setSpellcheck} label="Spellcheck" />
      </div>
    </div>
  )
}
