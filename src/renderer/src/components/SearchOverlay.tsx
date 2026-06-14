import { useEffect, useRef, useState, useCallback } from 'react'
import { FileText, Search } from 'lucide-react'
import type { TreeNode } from '../../../shared/ipc'
import {
  flattenMarkdownFiles,
  matchByName,
  matchByContent,
  type SearchResult
} from '@/lib/searchContent'
import { api } from '@/lib/api'

interface SearchOverlayProps {
  tree: TreeNode[]
  onOpen: (path: string) => void
  onClose: () => void
}

type SearchMode = 'name' | 'content'

export function SearchOverlay({ tree, onOpen, onClose }: SearchOverlayProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('name')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIdx(0)
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      return
    }

    const files = flattenMarkdownFiles(tree)

    if (mode === 'name') {
      setResults(matchByName(files, query).slice(0, 50))
      setSearching(false)
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSearching(true)
    matchByContent(files, query, api.readFile)
      .then((res) => {
        if (ctrl.signal.aborted) return
        setResults(res.slice(0, 50))
        setSearching(false)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSearching(false)
      })

    return () => ctrl.abort()
  }, [query, mode, tree])

  const openSelected = useCallback(() => {
    const r = results[selectedIdx]
    if (r) {
      onOpen(r.path)
      onClose()
    }
  }, [results, selectedIdx, onOpen, onClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        openSelected()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, openSelected, results.length])

  const tabBase = 'px-3 py-1 text-[12px] rounded-md transition-colors'
  const tabActive = 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium'
  const tabInactive = 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0_0_0/0.45)] pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="flex w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-4 py-3">
          <Search size={15} className="flex-none text-[color:var(--text-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'name' ? '搜索文件名…' : '搜索文件内容…'}
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
          />
          {searching && (
            <span className="text-[11px] text-[color:var(--text-faint)]">搜索中…</span>
          )}
        </div>

        <div className="flex gap-1 border-b border-[color:var(--border-soft)] px-3 py-1.5">
          <button
            className={[tabBase, mode === 'name' ? tabActive : tabInactive].join(' ')}
            onClick={() => setMode('name')}
          >
            文件名
          </button>
          <button
            className={[tabBase, mode === 'content' ? tabActive : tabInactive].join(' ')}
            onClick={() => setMode('content')}
          >
            内容
          </button>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 && query.trim() && !searching && (
            <div className="px-3 py-4 text-center text-[12.5px] text-[color:var(--text-faint)]">
              没有找到匹配结果
            </div>
          )}
          {results.length === 0 && !query.trim() && (
            <div className="px-3 py-4 text-center text-[12.5px] text-[color:var(--text-faint)]">
              输入文件名或内容关键词
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.path}
              onClick={() => { onOpen(r.path); onClose() }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={[
                'flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors',
                i === selectedIdx
                  ? 'bg-[color:var(--accent-soft)]'
                  : 'hover:bg-[color:var(--bg-hover)]'
              ].join(' ')}
            >
              <FileText size={14} className="mt-0.5 flex-none text-[color:var(--text-faint)]" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">{r.name}</div>
                {r.snippet && (
                  <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[color:var(--text-dim)]">
                    {r.snippet}
                  </div>
                )}
                <div className="mt-0.5 truncate text-[10.5px] text-[color:var(--text-faint)]">
                  {r.path}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
