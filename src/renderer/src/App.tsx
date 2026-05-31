import { useEffect, useRef } from 'react'
import { Editor } from '@/components/Editor'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
  }, [themeMode, systemDark])

  async function openFile(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    const text = await window.margin.readFile(chosen)
    useDocumentStore.getState().load(chosen, text)
  }

  function save(): Promise<void> {
    return saveDocument(window.margin.writeFile)
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  // Flush a pending autosave on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const fileName = path ? path.split('/').pop() : 'No file open'

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 pl-20 text-sm text-muted-foreground">
        <button
          onClick={() => void openFile()}
          className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground hover:bg-accent"
        >
          Open…
        </button>
        <span className="truncate">{fileName}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs ${saveStatus === 'error' ? 'text-destructive' : ''}`}>
            {saveStatus === 'saved'
              ? 'Saved'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'error'
                  ? 'Save failed — retrying on next edit'
                  : 'Unsaved'}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        {path ? (
          <Editor
            docKey={path}
            initialValue={content}
            onChange={handleChange}
            onSave={() => void save()}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Open a Markdown file to start editing
          </div>
        )}
      </main>
    </div>
  )
}
