import { useEffect, useRef } from 'react'
import { Editor } from '@/components/Editor'
import { useDocumentStore } from '@/stores/documentStore'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function openFile(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    const text = await window.margin.readFile(chosen)
    useDocumentStore.getState().load(chosen, text)
  }

  async function save(): Promise<void> {
    const s = useDocumentStore.getState()
    if (!s.path || !s.isDirty()) return
    const toWrite = s.content
    s.markSaving()
    await window.margin.writeFile(s.path, toWrite)
    useDocumentStore.getState().markSaved(toWrite)
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
        <span className="ml-auto text-xs">
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
        </span>
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
