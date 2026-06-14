import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { PanelLeft, AlignLeft, CalendarDays, CalendarPlus, FolderOpen, Settings } from 'lucide-react'
import { Editor, type EditorHandle } from '@/components/Editor'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { collectScheduleDates, scheduleFileName, scheduleTemplate } from '@/lib/schedule'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { RowContextMenu, type ContextMenuState } from '@/components/FileTree/RowContextMenu'
import { MoveDialog } from '@/components/FileTree/MoveDialog'
import { CalendarPopover } from '@/components/CalendarPopover'
import { InputDialog } from '@/components/InputDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsPanel } from '@/components/SettingsPanel'
import { ThemeToggle } from '@/components/ThemeToggle'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
import { useVaultWatch } from '@/hooks/useVaultWatch'
import { useProjectConfig } from '@/hooks/useProjectConfig'
import { useDraft } from '@/hooks/useDraft'
import { DraftBanner } from '@/components/DraftBanner'
import { ConflictBar } from '@/components/ConflictBar'
import { StatusBar } from '@/components/StatusBar'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { isExternal, resolveRelative } from '@/lib/resolvePath'
import { api } from '@/lib/api'
import type { TreeNode } from '../../shared/ipc'

const AUTOSAVE_MS = 800

/* Dialog state types ─────────────────────────────────────────── */

type DialogState =
  | null
  | { type: 'newNote'; folder: TreeNode }
  | { type: 'newFolder'; folder: TreeNode }
  | { type: 'rename'; node: TreeNode }
  | { type: 'trash'; node: TreeNode }

/** Unsaved-changes indicator. A leaf subscriber so it re-renders on each
 *  keystroke without dragging App (and the file tree) along. */
function DirtyDot(): JSX.Element {
  const dirty = useDocumentStore((s) => s.content !== s.savedContent)
  return (
    <span
      className="text-[color:var(--accent)] transition-opacity"
      style={{ opacity: dirty ? 1 : 0 }}
      aria-hidden
    >
      ●
    </span>
  )
}

export default function App(): JSX.Element {
  // Only `path` and `epoch` are subscribed here — a keystroke changes `content`,
  // not `path` or `epoch`, so the App component (and the whole file-tree subtree
  // below it) does NOT re-render while typing. Content is consumed by leaf
  // subscribers: the editor reads it non-reactively on (re)mount, the dirty dot
  // and status bar subscribe to it themselves.
  const path = useDocumentStore((s) => s.path)
  const epoch = useDocumentStore((s) => s.epoch)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorHandle>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [moveTarget, setMoveTarget] = useState<TreeNode | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  const vaultRoot = useVaultStore((s) => s.root)
  const vaultTree = useVaultStore((s) => s.tree)
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const scheduleDates = useMemo(
    () => (scheduleEnabled ? collectScheduleDates(vaultTree, scheduleDir) : new Set<string>()),
    [vaultTree, scheduleDir, scheduleEnabled]
  )

  useVaultWatch()
  useProjectConfig()
  useDraft()

  /* ── Theme ─────────────────────────────────────────────────── */

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  }, [themeMode, systemDark])

  /* ── Boot: open persisted vault root ───────────────────────── */

  useEffect(() => {
    const saved = loadPersistedRoot()
    if (!saved) return
    void api
      .scanVault(saved)
      .then((tree) => useVaultStore.getState().openRoot(saved, tree))
      .catch(() => useVaultStore.getState().closeVault())
  }, [])

  /* ── Global keyboard shortcuts ─────────────────────────────── */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setDrawerOpen((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* ── Core file operations ──────────────────────────────────── */

  // Stable identities so the memoized <Sidebar> doesn't reconcile the whole
  // file tree when App re-renders for unrelated reasons (dialogs, drawer/theme).
  const openFolder = useCallback(async (): Promise<void> => {
    const chosen = await api.openFolder()
    if (!chosen) return
    const tree = await api.scanVault(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
  }, [])

  const openFileByPath = useCallback(async (filePath: string): Promise<void> => {
    const text = await api.readFile(filePath)
    useDocumentStore.getState().load(filePath, text)
    useVaultStore.getState().select(filePath)
    const root = useVaultStore.getState().root
    if (root) {
      const draft = await api.readDraft(root, filePath).catch(() => null)
      if (draft != null && draft !== text && useDocumentStore.getState().path === filePath) {
        useDocumentStore.getState().setPendingDraft(draft)
      }
    }
  }, [])

  const handleOpenLink = useCallback(
    (url: string): void => {
      if (isExternal(url)) {
        void shellOpen(url).catch(() => {})
        return
      }
      const docPath = useDocumentStore.getState().path
      const target = resolveRelative(url, docPath)
      if (target && target.endsWith('.md')) {
        void openFileByPath(target).catch(() => {
          window.alert(`无法打开链接目标: ${url}`)
        })
      }
    },
    [openFileByPath]
  )

  const handleOpenFolder = useCallback(() => void openFolder(), [openFolder])
  const handleOpenFile = useCallback(
    (node: TreeNode) => void openFileByPath(node.path),
    [openFileByPath]
  )

  function save(): Promise<void> {
    return saveDocument(api.writeFile, api.readFile)
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

  const handleContextMenu = useCallback((node: TreeNode, x: number, y: number): void => {
    setMenu({ node, x, y })
  }, [])

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await api.scanVault(root)
    useVaultStore.getState().setTree(tree)
  }

  function targetDir(node: TreeNode): string {
    return node.type === 'folder' ? node.path : node.path.replace(/\/[^/]+$/, '')
  }

  /* ── Context-menu actions (driven by the dialog state machine) ── */

  const closeDialog = useCallback(() => setDialog(null), [])

  async function doNewNote(folder: TreeNode, name: string): Promise<void> {
    const created = await api.createNote(targetDir(folder), name)
    await refreshTree()
    await openFileByPath(created)
  }

  async function doNewFolder(folder: TreeNode, name: string): Promise<void> {
    await api.createFolder(targetDir(folder), name)
    await refreshTree()
  }

  async function doRename(node: TreeNode, name: string): Promise<void> {
    if (name === node.name) return
    const newPath = await api.renamePath(node.path, name)
    await refreshTree()
    if (useDocumentStore.getState().path === node.path) {
      const text = await api.readFile(newPath)
      useDocumentStore.getState().load(newPath, text)
      useVaultStore.getState().select(newPath)
    }
  }

  async function doTrash(node: TreeNode): Promise<void> {
    await api.trashPath(node.path)
    if (useDocumentStore.getState().path === node.path) {
      useDocumentStore.getState().reset()
    }
    await refreshTree()
  }

  async function doMove(node: TreeNode, destDir: string): Promise<void> {
    const newPath = await api.movePath(node.path, destDir)
    if (useDocumentStore.getState().path === node.path) {
      const text = await api.readFile(newPath)
      useDocumentStore.getState().load(newPath, text)
      useVaultStore.getState().select(newPath)
    }
    await refreshTree()
  }

  /* ── Schedule (日程) ───────────────────────────────────────── */

  async function ensureRoot(): Promise<string | null> {
    const existing = useVaultStore.getState().root
    if (existing) return existing
    const chosen = await api.openFolder()
    if (!chosen) return null
    const tree = await api.scanVault(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
    return chosen
  }

  async function openSchedule(date: Date): Promise<void> {
    const root = await ensureRoot()
    if (!root) return
    const dirPath = `${root}/${scheduleDir}`
    const created = await api.ensureNote(
      dirPath,
      scheduleFileName(date),
      scheduleTemplate(date)
    )
    await refreshTree()
    await openFileByPath(created)
  }

  /* ── Title bar info ────────────────────────────────────────── */

  const parts = path ? path.split('/') : []
  const fileName = parts.length > 0 ? parts[parts.length - 1] : ''
  const parentName = parts.length > 1 ? parts[parts.length - 2] : ''

  function handleJumpToLine(line: number): void {
    editorRef.current?.jumpToLine(line)
  }

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && (
        <Sidebar
          onOpenFile={handleOpenFile}
          onContextMenu={handleContextMenu}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={[
            'flex h-[34px] shrink-0 items-center gap-3 bg-[color:var(--bg)] px-3 text-sm text-[color:var(--text-faint)] [-webkit-app-region:drag]',
            sidebarOpen ? '' : 'pl-20'
          ].join(' ')}
        >
          <div className="flex gap-0.5 [-webkit-app-region:no-drag]">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title="切换笔记列表 (⌘B)"
              aria-label="Toggle sidebar"
              className={[
                'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
                sidebarOpen
                  ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              <PanelLeft size={16} />
            </button>
            <button
              onClick={handleOpenFolder}
              title="打开文件夹"
              aria-label="打开文件夹"
              className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <FolderOpen size={16} />
            </button>
            {scheduleEnabled && (
              <button
                onClick={() => void openSchedule(new Date())}
                title="今日日程"
                aria-label="今日日程"
                className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
              >
                <CalendarPlus size={16} />
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[12px] font-medium text-[color:var(--text-faint)]">
            {path ? (
              <>
                {parentName && <span className="text-[color:var(--text-faint)]">{parentName}</span>}
                {parentName && <span className="text-[color:var(--text-faint)]">/</span>}
                <span id="title-name" className="truncate">{fileName}</span>
                <DirtyDot />
              </>
            ) : (
              <span className="text-[color:var(--text-faint)]">未打开文件</span>
            )}
          </div>

          <div className="relative flex gap-0.5 [-webkit-app-region:no-drag]">
            <ThemeToggle />
            {scheduleEnabled && (
              <button
                onClick={() => setCalendarOpen((v) => !v)}
                title="日历"
                aria-label="日历"
                className={[
                  'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
                  calendarOpen
                    ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
                    : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
                ].join(' ')}
              >
                <CalendarDays size={16} />
              </button>
            )}
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              title="大纲 (⌘\)"
              aria-label="Toggle outline"
              className={[
                'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
                drawerOpen
                  ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              <AlignLeft size={16} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              title="设置 (⌘,)"
              aria-label="设置"
              className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <Settings size={16} />
            </button>
            {calendarOpen && scheduleEnabled && (
              <CalendarPopover
                scheduleDates={scheduleDates}
                onPick={(date) => {
                  setCalendarOpen(false)
                  void openSchedule(date)
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">
            {path ? (
              <div className="flex h-full flex-col">
                <DraftBanner />
                <ConflictBar />
                <div className="min-h-0 flex-1">
                  <Editor
                    ref={editorRef}
                    docKey={`${path}:${epoch}`}
                    // Read non-reactively: the editor is uncontrolled and keyed by
                    // `${path}:${epoch}`, so it only consumes this on (re)mount when
                    // a file opens or a draft is applied. `load()` sets
                    // path+content together, so it's current here.
                    initialValue={useDocumentStore.getState().content}
                    onChange={handleChange}
                    onSave={() => void save()}
                    onOpenLink={handleOpenLink}
                    filePath={path}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                打开文件夹或文件开始编辑
              </div>
            )}
          </main>
          {drawerOpen && path && (
            <OutlineDrawer onJumpToLine={handleJumpToLine} />
          )}
        </div>

        <StatusBar hasFile={path !== null} />
      </div>

      {/* ── Context menu ──────────────────────────────────────── */}

      {menu && (
        <RowContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewNote={(n) => {
            setMenu(null)
            setDialog({ type: 'newNote', folder: n })
          }}
          onNewFolder={(n) => {
            setMenu(null)
            setDialog({ type: 'newFolder', folder: n })
          }}
          onRename={(n) => {
            setMenu(null)
            setDialog({ type: 'rename', node: n })
          }}
          onMove={(n) => {
            setMenu(null)
            setMoveTarget(n)
          }}
          onTrash={(n) => {
            setMenu(null)
            setDialog({ type: 'trash', node: n })
          }}
        />
      )}

      {/* ── Dialog state machine ──────────────────────────────── */}

      {dialog?.type === 'newNote' && (
        <InputDialog
          title="新建笔记"
          placeholder="笔记名称"
          onConfirm={(name) => {
            const folder = dialog.folder
            closeDialog()
            void doNewNote(folder, name)
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === 'newFolder' && (
        <InputDialog
          title="新建文件夹"
          placeholder="文件夹名称"
          onConfirm={(name) => {
            const folder = dialog.folder
            closeDialog()
            void doNewFolder(folder, name)
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === 'rename' && (
        <InputDialog
          title="重命名"
          defaultValue={dialog.node.name}
          onConfirm={(name) => {
            const node = dialog.node
            closeDialog()
            void doRename(node, name)
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === 'trash' && (
        <ConfirmDialog
          title="移到废纸篓"
          message={`确定要将"${dialog.node.name}"移到废纸篓吗？`}
          confirmLabel="移到废纸篓"
          danger
          onConfirm={() => {
            const node = dialog.node
            closeDialog()
            void doTrash(node)
          }}
          onCancel={closeDialog}
        />
      )}

      {moveTarget && vaultRoot && (
        <MoveDialog
          node={moveTarget}
          root={vaultRoot}
          rootName={vaultRoot.split('/').pop() ?? '文件库'}
          tree={vaultTree}
          onMove={(destDir) => {
            const node = moveTarget
            setMoveTarget(null)
            void doMove(node, destDir)
          }}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {/* ── Settings panel ────────────────────────────────────── */}

      {settingsOpen && (
        <SettingsPanel
          tree={vaultTree}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
