import { useEffect, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Editor } from '@/components/Editor'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
import type { TreeNode } from '../../shared/ipc'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  }, [themeMode, systemDark])

  // Reopen the last vault on launch.
  useEffect(() => {
    const saved = loadPersistedRoot()
    if (!saved) return
    void window.margin
      .scanVault(saved)
      .then((tree) => useVaultStore.getState().openRoot(saved, tree))
      .catch(() => useVaultStore.getState().closeVault())
  }, [])

  async function openFolder(): Promise<void> {
    const chosen = await window.margin.openFolder()
    if (!chosen) return
    const tree = await window.margin.scanVault(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
  }

  async function openFileByPath(filePath: string): Promise<void> {
    const text = await window.margin.readFile(filePath)
    useDocumentStore.getState().load(filePath, text)
    useVaultStore.getState().select(filePath)
  }

  async function openFileDialog(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    await openFileByPath(chosen)
  }

  function save(): Promise<void> {
    return saveDocument(window.margin.writeFile)
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Context menu is implemented in a later task; no-op for now.
  function handleContextMenu(_node: TreeNode, _x: number, _y: number): void {}

  const fileName = path ? path.split('/').pop() : 'No file open'

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 pl-20 text-sm text-muted-foreground">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="grid h-[26px] w-[30px] place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={() => void openFileDialog()}
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
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            onOpenFolder={() => void openFolder()}
            onOpenFile={(node) => void openFileByPath(node.path)}
            onContextMenu={handleContextMenu}
          />
        )}
        <main className="min-h-0 min-w-0 flex-1">
          {path ? (
            <Editor
              docKey={path}
              initialValue={content}
              onChange={handleChange}
              onSave={() => void save()}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Open a folder or file to start editing
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
