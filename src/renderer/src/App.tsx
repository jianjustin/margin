import { useEffect, useMemo, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { AlignLeft, CalendarDays, Link2, PanelLeft, Settings } from 'lucide-react'
import { SearchOverlay } from '@/components/SearchOverlay'
import { Editor, type EditorHandle } from '@/components/Editor'
import { saveDocument, waitForDocumentSaves } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { collectScheduleDates, normalizeScheduleDir, scheduleFileName, scheduleTemplate } from '@/lib/schedule'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { RowContextMenu, type ContextMenuState } from '@/components/FileTree/RowContextMenu'
import { MoveDialog } from '@/components/FileTree/MoveDialog'
import { CalendarPopover } from '@/components/CalendarPopover'
import { InputDialog } from '@/components/InputDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsPanel } from '@/components/SettingsPanel'
import { ThemeToggle } from '@/components/ThemeToggle'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { BacklinksPanel } from '@/components/BacklinksPanel'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
import { useVaultWatch } from '@/hooks/useVaultWatch'
import { useProjectConfig } from '@/hooks/useProjectConfig'
import { useDraft } from '@/hooks/useDraft'
import { DraftBanner } from '@/components/DraftBanner'
import { ConflictBar } from '@/components/ConflictBar'
import { StatusBar } from '@/components/StatusBar'
import { DocumentTabs } from '@/components/DocumentTabs'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { isExternal, resolveRelative } from '@/lib/resolvePath'
import { resolveWikiLinkTarget } from '@/lib/wikiLinks'
import { projectRelativePath } from '@/lib/copyPath'
import { isMarkdownFile } from '@/lib/fileKinds'
import {
  beginPathMutation,
  endPathMutation,
  isAffectedPath,
  pathMutationGuardFor,
  type PathMutationGuard
} from '@/lib/pathMutationGuards'
import {
  LEFT_PANE,
  RIGHT_PANE,
  clampPaneWidth,
  loadPaneWidth,
  persistPaneWidth,
  type PaneSpec
} from '@/lib/layout'
import { api } from '@/lib/api'
import { createPeerWindow, parseOpenParam, parseVaultParam, isBlankWindow } from '@/lib/windowManager'
import { startEventBridge } from '@/lib/eventBridge'
import { emit } from '@tauri-apps/api/event'
import { windowId, EV_PATH_MUTATED } from '@/lib/windowIdentity'
import type { TreeNode } from '../../shared/ipc'

const AUTOSAVE_MS = 800

interface PausedSavePaths {
  affected: string[]
  unaffected: string[]
}

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
  // Only active-document identity and tab presence are subscribed here — a
  // keystroke changes active tab content, not these values, so App (and the
  // file-tree subtree below it) does NOT re-render while typing. Content is
  // consumed by leaf subscribers: the editor reads it non-reactively on
  // (re)mount, the dirty dot and status bar subscribe to it themselves.
  const path = useDocumentStore((s) => s.path)
  const epoch = useDocumentStore((s) => s.epoch)
  const hasTabs = useDocumentStore((s) => s.tabs.length > 0)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerPaths = useRef<string[]>([])
  const editorRef = useRef<EditorHandle>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [backlinksOpen, setBacklinksOpen] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [moveTarget, setMoveTarget] = useState<TreeNode | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => loadPaneWidth(LEFT_PANE))
  const [rightPaneWidth, setRightPaneWidth] = useState(() => loadPaneWidth(RIGHT_PANE))

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  const vaultRoot = useVaultStore((s) => s.root)
  const vaultTree = useVaultStore((s) => s.tree)
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)
  const assetsDir = useSettingsStore((s) => s.assetsDir)
  const plantUmlServerUrl = useSettingsStore((s) => s.plantUmlServerUrl)
  const diagramFitWidth = useSettingsStore((s) => s.diagramFitWidth)
  const mathEnabled = useSettingsStore((s) => s.mathEnabled)
  const scheduleDates = useMemo(
    () => (scheduleEnabled ? collectScheduleDates(vaultTree, scheduleDir) : new Set<string>()),
    [vaultTree, scheduleDir, scheduleEnabled]
  )

  useVaultWatch()
  useProjectConfig()
  useDraft()

  useEffect(() => {
    if (!vaultRoot) return
    void scanVaultWithSettings(vaultRoot)
      .then((tree) => useVaultStore.getState().setTree(tree))
      .catch(() => {})
  }, [vaultRoot, hiddenFolders])

  /* ── Theme ─────────────────────────────────────────────────── */

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  }, [themeMode, systemDark])

  /* ── Boot: determine window role and open vault ────────────── */

  useEffect(() => {
    // Start cross-window event bridge (idempotent per window).
    const stopBridge = startEventBridge()

    const openParam = parseOpenParam()
    const vaultParam = parseVaultParam()

    if (openParam && vaultParam) {
      // Window created via "Open in New Window" — auto-open the target.
      void scanVaultWithSettings(vaultParam)
        .then((tree) => {
          useVaultStore.getState().openRoot(vaultParam, tree)
          return api.readFile(openParam)
        })
        .then((text) => {
          if (text) {
            useDocumentStore.getState().openOrActivate(openParam, text)
            useVaultStore.getState().select(openParam)
          }
        })
        .catch(() => useVaultStore.getState().closeVault())
    } else if (isBlankWindow()) {
      // Window created via Cmd+Shift+N — start blank, no auto-restore.
    } else {
      // Main window (first launch) — restore persisted vault.
      const saved = loadPersistedRoot()
      if (!saved) return
      void scanVaultWithSettings(saved)
        .then((tree) => useVaultStore.getState().openRoot(saved, tree))
        .catch(() => useVaultStore.getState().closeVault())
    }

    return stopBridge
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        createPeerWindow()
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
    const tree = await scanVaultWithSettings(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
  }, [])

  const openFileByPath = useCallback(async (filePath: string): Promise<void> => {
    const existing = useDocumentStore.getState().tabForPath(filePath)
    if (existing) {
      useDocumentStore.getState().setActivePath(filePath)
      useVaultStore.getState().select(filePath)
      return
    }

    const text = await api.readFile(filePath)
    useDocumentStore.getState().openOrActivate(filePath, text)
    useVaultStore.getState().select(filePath)
    const root = useVaultStore.getState().root
    if (root) {
      const draft = await api.readDraft(root, filePath).catch(() => null)
      if (draft != null && draft !== text && useDocumentStore.getState().tabForPath(filePath)) {
        useDocumentStore.getState().setPendingDraft(filePath, draft)
      }
    }
  }, [])

  const handleOpenLink = useCallback(
    (url: string): void => {
      if (url.startsWith('wiki:')) {
        const target = resolveWikiLinkTarget(url.slice(5), useVaultStore.getState().tree)
        if (target) {
          void openFileByPath(target).catch(() => {
            window.alert(`无法打开链接目标: ${url.slice(5)}`)
          })
        }
        return
      }
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
    (node: TreeNode) => {
      if (node.type !== 'file' || !isMarkdownFile(node.name)) return
      void openFileByPath(node.path)
    },
    [openFileByPath]
  )

  function save(targetPath?: string): Promise<void> {
    return saveDocument(api.writeFile, api.readFile, targetPath)
  }

  function clearPendingSave(): void {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    saveTimerPaths.current = []
  }

  function uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths))
  }

  function pausePendingSaveIfAffected(basePath: string): PausedSavePaths {
    const paused: PausedSavePaths = { affected: [], unaffected: [] }
    if (!saveTimer.current) return paused

    for (const path of uniquePaths(saveTimerPaths.current)) {
      if (isAffectedPath(path, basePath)) paused.affected.push(path)
      else paused.unaffected.push(path)
    }

    if (paused.affected.length === 0) return paused
    clearPendingSave()
    scheduleDirtyAffectedTabsSave(paused.unaffected)
    return paused
  }

  function affectedOpenTabPaths(basePath: string): string[] {
    return useDocumentStore
      .getState()
      .tabs
      .filter((tab) => isAffectedPath(tab.path, basePath))
      .map((tab) => tab.path)
  }

  async function deleteDraftsForPaths(paths: string[]): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root || paths.length === 0) return
    await Promise.all(uniquePaths(paths).map((draftPath) => api.deleteDraft(root, draftPath).catch(() => {})))
  }

  function restorePausedAndBlockedSave(paused: PausedSavePaths, guard: PathMutationGuard): void {
    scheduleDirtyAffectedTabsSave([...paused.affected, ...paused.unaffected, ...guard.blockedPaths])
  }

  function scheduleDirtyAffectedTabsSave(paths: string[]): void {
    const candidates = uniquePaths([...saveTimerPaths.current, ...paths])
    if (saveTimer.current) clearTimeout(saveTimer.current)

    const schedulableCandidates: string[] = []
    for (const nextPath of candidates) {
      const guard = pathMutationGuardFor(nextPath)
      if (guard) guard.blockedPaths = uniquePaths([...guard.blockedPaths, nextPath])
      else schedulableCandidates.push(nextPath)
    }

    const dirtyPaths = schedulableCandidates.filter((nextPath) => {
      const tab = useDocumentStore.getState().tabForPath(nextPath)
      return tab != null && tab.content !== tab.savedContent
    })
    if (dirtyPaths.length === 0) {
      saveTimer.current = null
      saveTimerPaths.current = []
      return
    }
    saveTimerPaths.current = dirtyPaths
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      saveTimerPaths.current = []
      dirtyPaths.forEach((nextPath) => void save(nextPath))
    }, AUTOSAVE_MS)
  }

  function replaceAffectedOpenTabPaths(oldBasePath: string, newBasePath: string): void {
    const store = useDocumentStore.getState()
    const affectedTabs = store.tabs.filter((tab) => isAffectedPath(tab.path, oldBasePath))
    if (affectedTabs.length === 0) return

    const activeBefore = store.activePath
    let selectedPath = activeBefore
    const nextPaths: string[] = []

    for (const tab of affectedTabs) {
      const nextPath = `${newBasePath}${tab.path.slice(oldBasePath.length)}`
      useDocumentStore.getState().replacePath(tab.path, nextPath)
      nextPaths.push(nextPath)
      if (tab.path === activeBefore) selectedPath = nextPath
    }

    useVaultStore.getState().select(selectedPath)
    scheduleDirtyAffectedTabsSave(nextPaths)
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setActiveContent(value)
    const currentPath = useDocumentStore.getState().activePath
    if (currentPath) scheduleDirtyAffectedTabsSave([currentPath])
  }

  useEffect(() => {
    return () => {
      clearPendingSave()
    }
  }, [])

  const handleContextMenu = useCallback((node: TreeNode, x: number, y: number): void => {
    setMenu({ node, x, y })
  }, [])

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await scanVaultWithSettings(root)
    useVaultStore.getState().setTree(tree)
  }

  function targetDir(node: TreeNode): string {
    return node.type === 'folder' ? node.path : node.path.replace(/\/[^/]+$/, '')
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.alert('复制失败')
    }
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
    const affectedPaths = affectedOpenTabPaths(node.path)
    const pausedPaths = pausePendingSaveIfAffected(node.path)
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await waitForDocumentSaves(affectedPaths)
      const newPath = await api.renamePath(node.path, name)
      succeeded = true
      replaceAffectedOpenTabPaths(node.path, newPath)
      void emit(EV_PATH_MUTATED, { action: 'rename', oldPath: node.path, newPath, _source: windowId })
      await deleteDraftsForPaths(affectedPaths)
      await refreshTree()
    } catch (err) {
      console.error('Failed to rename path:', err)
    } finally {
      endPathMutation(guard)
      if (!succeeded) restorePausedAndBlockedSave(pausedPaths, guard)
    }
  }

  async function doTrash(node: TreeNode): Promise<void> {
    const affectedPaths = affectedOpenTabPaths(node.path)
    const pausedPaths = pausePendingSaveIfAffected(node.path)
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await waitForDocumentSaves(affectedPaths)
      await api.trashPath(node.path)
      succeeded = true
      for (const affectedPath of affectedPaths) {
        useDocumentStore.getState().removePath(affectedPath)
      }
      void emit(EV_PATH_MUTATED, { action: 'trash', oldPath: node.path, _source: windowId })
      useVaultStore.getState().select(useDocumentStore.getState().activePath)
      await deleteDraftsForPaths(affectedPaths)
      await refreshTree()
    } catch (err) {
      console.error('Failed to trash path:', err)
    } finally {
      endPathMutation(guard)
      if (!succeeded) restorePausedAndBlockedSave(pausedPaths, guard)
    }
  }

  async function doMove(node: TreeNode, destDir: string): Promise<void> {
    const affectedPaths = affectedOpenTabPaths(node.path)
    const pausedPaths = pausePendingSaveIfAffected(node.path)
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await waitForDocumentSaves(affectedPaths)
      const newPath = await api.movePath(node.path, destDir)
      succeeded = true
      replaceAffectedOpenTabPaths(node.path, newPath)
      void emit(EV_PATH_MUTATED, { action: 'move', oldPath: node.path, newPath, _source: windowId })
      await deleteDraftsForPaths(affectedPaths)
      await refreshTree()
    } catch (err) {
      console.error('Failed to move path:', err)
    } finally {
      endPathMutation(guard)
      if (!succeeded) restorePausedAndBlockedSave(pausedPaths, guard)
    }
  }

  /* ── Schedule (日程) ───────────────────────────────────────── */

  async function ensureRoot(): Promise<string | null> {
    const existing = useVaultStore.getState().root
    if (existing) return existing
    const chosen = await api.openFolder()
    if (!chosen) return null
    const tree = await scanVaultWithSettings(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
    return chosen
  }

  async function openSchedule(date: Date): Promise<void> {
    const root = await ensureRoot()
    if (!root) return
    const cleanScheduleDir = normalizeScheduleDir(scheduleDir) || '日程'
    const dirPath = `${root}/${cleanScheduleDir}`
    const created = await api.ensureNote(
      dirPath,
      scheduleFileName(date),
      scheduleTemplate(date)
    )
    await refreshTree()
    await openFileByPath(created)
  }

  const handleOpenSearch = useCallback(() => setSearchOpen(true), [])
  const handleOpenToday = useCallback(() => void openSchedule(new Date()), [scheduleDir])
  const handleCollapseSidebar = useCallback(() => setSidebarOpen(false), [])
  const handleNewWindow = useCallback(() => createPeerWindow(), [])

  /* ── Title bar info ────────────────────────────────────────── */

  const parts = path ? path.split('/') : []
  const fileName = parts.length > 0 ? parts[parts.length - 1] : ''
  const parentName = parts.length > 1 ? parts[parts.length - 2] : ''

  function handleJumpToLine(line: number): void {
    editorRef.current?.jumpToLine(line)
  }

  const handleActivateTab = useCallback((filePath: string): void => {
    useDocumentStore.getState().setActivePath(filePath)
    useVaultStore.getState().select(filePath)
  }, [])

  const handleCloseTab = useCallback(async (filePath: string): Promise<void> => {
    const tab = useDocumentStore.getState().tabForPath(filePath)
    if (!tab) return
    if (tab.conflict != null) {
      useDocumentStore.getState().setActivePath(filePath)
      useVaultStore.getState().select(filePath)
      return
    }
    if (tab.content !== tab.savedContent) {
      await saveDocument(api.writeFile, api.readFile, filePath)
      const after = useDocumentStore.getState().tabForPath(filePath)
      if (!after || after.content !== after.savedContent || after.saveStatus === 'error' || after.conflict != null) {
        useDocumentStore.getState().setActivePath(filePath)
        useVaultStore.getState().select(filePath)
        return
      }
    }
    useDocumentStore.getState().closeTab(filePath)
    useVaultStore.getState().select(useDocumentStore.getState().activePath)
  }, [])

  function startPaneResize(
    e: ReactPointerEvent,
    spec: PaneSpec,
    initialWidth: number,
    setWidth: (width: number) => void,
    direction: 1 | -1
  ): void {
    e.preventDefault()
    const startX = e.clientX
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    function move(ev: PointerEvent): void {
      const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
      setWidth(next)
    }

    function up(ev: PointerEvent): void {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = previousUserSelect
      const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
      setWidth(persistPaneWidth(spec, next))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && (
        <>
          <Sidebar
            width={leftPaneWidth}
            scheduleEnabled={scheduleEnabled}
            onOpenFolder={handleOpenFolder}
            onOpenSearch={handleOpenSearch}
            onOpenToday={handleOpenToday}
            onCollapse={handleCollapseSidebar}
            onNewWindow={handleNewWindow}
            onOpenFile={handleOpenFile}
            onContextMenu={handleContextMenu}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => startPaneResize(e, LEFT_PANE, leftPaneWidth, setLeftPaneWidth, 1)}
            className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
          />
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={[
            'flex h-[32px] shrink-0 items-center gap-2 bg-[color:var(--bg-panel)] px-2 text-sm text-[color:var(--text-faint)] border-b border-[color:var(--border-soft)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
            sidebarOpen ? '' : 'pl-20'
          ].join(' ')}
        >
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="显示文件树 (⌘B)"
              aria-label="显示文件树"
              className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground [-webkit-app-region:no-drag]"
            >
              <PanelLeft size={16} />
            </button>
          )}

          {hasTabs ? (
            <DocumentTabs onActivate={handleActivateTab} onClose={handleCloseTab} />
          ) : (
            <div data-tauri-drag-region className="min-w-0 flex-1" />
          )}

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
              onClick={() => setBacklinksOpen((v) => !v)}
              title="双链面板"
              aria-label="双链面板"
              className={[
                'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
                backlinksOpen
                  ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              <Link2 size={16} />
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

        {path && (
          <div
            data-tauri-drag-region
            className="flex h-[22px] shrink-0 items-center justify-center gap-2 border-b border-[color:var(--border-soft)] bg-[color:var(--bg)] px-3 text-[11.5px] font-medium text-[color:var(--text-faint)]"
          >
            {parentName && <span>{parentName}</span>}
            {parentName && <span>/</span>}
            <span id="title-name" className="truncate">{fileName}</span>
            <DirtyDot />
          </div>
        )}

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
                    // a file opens, moves, or a draft is applied. Store actions set
                    // path+content together, so it's current here.
                    initialValue={useDocumentStore.getState().content}
                    onChange={handleChange}
                    onSave={() => void save(path)}
                    onOpenLink={handleOpenLink}
                    onAssetImported={() => void refreshTree()}
                    filePath={path}
                    vaultRoot={vaultRoot}
                    assetsDir={assetsDir}
                    plantUmlServerUrl={plantUmlServerUrl}
                    diagramFitWidth={diagramFitWidth}
                    mathEnabled={mathEnabled}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <p className="text-sm">打开文件夹或文件开始编辑</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => void openFolder()}
                    className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                  >
                    打开文件夹
                  </button>
                  <button
                    onClick={() => createPeerWindow()}
                    className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-foreground hover:bg-[color:var(--bg-hover)] transition-colors"
                  >
                    新建窗口 (⇧⌘N)
                  </button>
                </div>
              </div>
            )}
          </main>
          {drawerOpen && path && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={(e) => startPaneResize(e, RIGHT_PANE, rightPaneWidth, setRightPaneWidth, -1)}
                className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
              />
              <OutlineDrawer width={rightPaneWidth} onJumpToLine={handleJumpToLine} />
            </>
          )}
          {backlinksOpen && path && (
            <BacklinksPanel width={rightPaneWidth} onOpenFile={handleOpenFile} />
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
          onCopyFullPath={(n) => {
            setMenu(null)
            void copyText(n.path)
          }}
          onCopyRelativePath={(n) => {
            setMenu(null)
            void copyText(projectRelativePath(vaultRoot, n.path))
          }}
          onOpenInNewWindow={(n) => {
            setMenu(null)
            if (vaultRoot) {
              createPeerWindow({ filePath: n.path, vaultRoot })
            }
          }}
          onOpenInFinder={(n) => {
            setMenu(null)
            void api.openPathInFinder(n.path).catch(() => {
              window.alert('无法在 Finder 中显示')
            })
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

      {/* ── Search overlay (⌘K) ───────────────────────────────── */}

      {searchOpen && vaultRoot && (
        <SearchOverlay
          tree={vaultTree}
          onOpen={(path) => void openFileByPath(path)}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
