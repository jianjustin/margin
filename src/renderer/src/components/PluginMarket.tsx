import { Search, Star, X } from 'lucide-react'
import { useState } from 'react'

interface PluginMarketProps {
  onBack: () => void
}

const CATEGORIES = [
  'Featured',
  'Editor',
  'Export',
  'Themes',
  'Sync & Backup',
  'Productivity',
] as const

const PLUGINS = [
  { name: 'Fuzzy Keyboard', author: 'keybind.io', rating: 4.9, color: 'oklch(0.55 0.14 250)', initials: '⌘' },
  { name: 'Push Notify', author: 'pushly.dev', rating: 4.8, color: 'oklch(0.58 0.12 160)', initials: '⇧' },
  { name: 'Table Editor', author: 'tabletool', rating: 4.7, color: 'oklch(0.60 0.14 30)', initials: '⊞' },
  { name: 'Git Sync', author: 'gitsync.app', rating: 4.6, color: 'oklch(0.55 0.08 200)', initials: 'G' },
]

export function PluginMarket({ onBack }: PluginMarketProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>('Featured')
  const [query, setQuery] = useState('')

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[oklch(0_0_0/0.5)]">
      <div
        className="flex h-[520px] w-[720px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <div className="flex w-[200px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[13px] font-semibold">Plugins</span>
            <button
              onClick={onBack}
              className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
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
                'flex items-center gap-2 border-l-2 px-4 py-2 text-left text-[13px] transition-colors',
                activeCategory === cat
                  ? 'border-l-[color:var(--accent)] bg-[color:var(--accent-soft)] font-medium text-[color:var(--accent)]'
                  : 'border-l-transparent text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground',
              ].join(' ')}
            >
              {cat === 'Featured' && <Star size={13} className="flex-none" />}
              {cat}
            </button>
          ))}

          <div className="my-2 mx-4 border-t border-[color:var(--border-soft)]" />

          <div className="px-4 py-1 text-[11.5px] font-medium text-[color:var(--text-faint)]">
            INSTALLED · 4
          </div>
        </div>

        {/* Right content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-4 py-2.5">
            <Search size={14} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
            />
          </div>

          {/* Plugin grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
              Popular
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PLUGINS.map((plugin) => (
                <div
                  key={plugin.name}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] p-3 transition-colors hover:border-[color:var(--accent-line)] hover:bg-[color:var(--bg-hover)]"
                >
                  <div
                    className="grid h-10 w-10 flex-none place-items-center rounded-lg text-[18px] text-white"
                    style={{ background: plugin.color }}
                  >
                    {plugin.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-foreground">{plugin.name}</div>
                    <div className="text-[11.5px] text-[color:var(--text-faint)]">{plugin.author}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[color:var(--accent)]">
                      <Star size={11} className="fill-current" />
                      {plugin.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
