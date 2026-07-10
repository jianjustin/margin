import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { BUILTIN_PLUGIN_MANIFESTS } from '@/plugin-api/builtins/registry'
import { useSettingsStore } from '@/stores/settingsStore'

interface PluginMarketProps {
  onBack: () => void
}

const CATEGORIES = [
  'Featured',
  'Editor',
  'Export',
  'Themes',
  'Sync & Backup',
  'Productivity'
] as const

const PERMISSION_LABELS: Record<string, string> = {
  commands: '命令',
  'vault.read': '读取文件库',
  'ui.sidebar': '侧边栏面板',
  'ui.status': '状态栏'
}

export function PluginMarket({ onBack }: PluginMarketProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>('Featured')
  const [query, setQuery] = useState('')
  const enabledPlugins = useSettingsStore((s) => s.enabledPlugins)
  const setPluginEnabled = useSettingsStore((s) => s.setPluginEnabled)

  const plugins = useMemo(() => {
    if (!query.trim()) return BUILTIN_PLUGIN_MANIFESTS
    const q = query.trim().toLowerCase()
    return BUILTIN_PLUGIN_MANIFESTS.filter(
      (m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <Modal open onClose={onBack}>
      <div
        className="flex h-[520px] w-[720px] max-w-[calc(100vw-32px)] overflow-hidden"
      >
        <div className="flex w-[200px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[13px] font-semibold">Plugins</span>
            <button
              onClick={onBack}
              className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
              aria-label="关闭插件市场"
            >
              <X size={14} />
            </button>
          </div>

          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'mx-2 flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
                activeCategory === cat
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)]'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              {cat}
            </button>
          ))}

          <div className="mx-4 my-2 border-t border-[color:var(--border-soft)]" />
          <div className="px-4 py-1 text-[11.5px] font-medium text-[color:var(--text-faint)]">
            已安装 · {BUILTIN_PLUGIN_MANIFESTS.length}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-4 py-2.5">
            <Search size={14} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
              内置插件
            </div>
            {plugins.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-[12.5px] text-[color:var(--text-faint)]">
                没有匹配的插件
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {plugins.map((manifest) => {
                  const enabled = enabledPlugins.includes(manifest.id)
                  return (
                    <div
                      key={manifest.id}
                      className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] p-3"
                    >
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[color:var(--accent-soft)] font-[family-name:var(--mono)] text-[17px] font-semibold text-[color:var(--accent)]">
                        {manifest.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-[13px] font-semibold text-foreground">{manifest.name}</div>
                          <Switch
                            checked={enabled}
                            onChange={(v) => setPluginEnabled(manifest.id, v)}
                            label={`${enabled ? '关闭' : '启用'} ${manifest.name}`}
                          />
                        </div>
                        {manifest.description && (
                          <div className="mt-0.5 text-[11.5px] text-[color:var(--text-faint)]">{manifest.description}</div>
                        )}
                        {manifest.permissions && manifest.permissions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {manifest.permissions.map((p) => (
                              <span
                                key={p}
                                className="rounded-full bg-[color:var(--bg-hover)] px-2 py-0.5 text-[10.5px] text-[color:var(--text-dim)]"
                              >
                                {PERMISSION_LABELS[p] ?? p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
