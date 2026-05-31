import { useEffect, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Editor } from '@/components/Editor'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { RowContextMenu, type ContextMenuState } from '@/components/FileTree/RowContextMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
import { useVaultWatch } from '@/hooks/useVaultWatch'
import { StatusBar } from '@/components/StatusBar'
import { useDocStats } from '@/hooks/useDocStats'
import type { TreeNode } from '../../shared/ipc'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)
  const dirty = useDocumentStore((s) => s.content !== s.savedContent)
  const stats = useDocStats(content)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  useVaultWatch()

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
  function handleContextMenu(node: TreeNode, x: number, y: number): void {
    setMenu({ node, x, y })
  }

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await window.margin.scanVault(root)
    useVaultStore.getState().setTree(tree)
  }

  function targetDir(node: TreeNode): string {
    return node.type === 'folder' ? node.path : node.path.replace(/\/[^/]+$/, '')
  }

  async function newNote(folder: TreeNode): Promise<void> {
    const name = window.prompt('New note name:')
    if (!name) return
    const created = await window.margin.createNote(targetDir(folder), name)
    await refreshTree()
    await openFileByPath(created)
  }

  async function newFolder(folder: TreeNode): Promise<void> {
    const name = window.prompt('New folder name:')
    if (!name) return
    await window.margin.createFolder(targetDir(folder), name)
    await refreshTree()
  }

  async function renameNode(node: TreeNode): Promise<void> {
    const name = window.prompt('Rename to:', node.name)
    if (!name || name === node.name) return
    const newPath = await window.margin.renamePath(node.path, name)
    await refreshTree()
    if (useDocumentStore.getState().path === node.path) {
      const text = await window.margin.readFile(newPath)
      useDocumentStore.getState().load(newPath, text)
      useVaultStore.getState().select(newPath)
    }
  }

  async function trashNode(node: TreeNode): Promise<void> {
    if (!window.confirm(`Move "${node.name}" to Trash?`)) return
    await window.margin.trashPath(node.path)
    if (useDocumentStore.getState().path === node.path) {
      useDocumentStore.getState().reset()
    }
    await refreshTree()
  }

  const parts = path ? path.split('/') : []
  const fileName = parts.length > 0 ? parts[parts.length - 1] : ''
  const parentName = parts.length > 1 ? parts[parts.length - 2] : ''

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
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[12.5px] text-[color:var(--text-dim)]">
          {path ? (
            <>
              {parentName && <span className="text-[color:var(--text-faint)]">{parentName} /</span>}
              <span className="truncate">{fileName}</span>
              <span
                className="h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--accent)] transition-opacity"
                style={{ opacity: dirty ? 1 : 0 }}
                aria-hidden
              />
            </>
          ) : (
            <span className="text-[color:var(--text-faint)]">No file open</span>
          )}
        </div>
        <ThemeToggle />
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
      <StatusBar stats={stats} saveStatus={saveStatus} hasFile={path !== null} />
      {menu && (
        <RowContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewNote={(n) => {
            setMenu(null)
            void newNote(n)
          }}
          onNewFolder={(n) => {
            setMenu(null)
            void newFolder(n)
          }}
          onRename={(n) => {
            setMenu(null)
            void renameNode(n)
          }}
          onTrash={(n) => {
            setMenu(null)
            void trashNode(n)
          }}
        />
      )}
    </div>
  )
}
