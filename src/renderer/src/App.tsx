import { useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useSavePipeline } from '@/hooks/useSavePipeline'
import { FolderOpen, PanelLeft, PanelRight, SlidersHorizontal } from 'lucide-react'
import { CalendarDayIcon } from '@/components/icons/CalendarDayIcon'
import { SearchOverlay } from '@/components/SearchOverlay'
import { Editor, type EditorHandle } from '@/components/Editor'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore, type DialogState } from '@/stores/uiStore'
import { normalizeScheduleDir, scheduleFileName, scheduleTemplate } from '@/lib/schedule'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { RowContextMenu } from '@/components/FileTree/RowContextMenu'
import { MoveDialog } from '@/components/FileTree/MoveDialog'
import { InputDialog } from '@/components/InputDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsPanel } from '@/components/SettingsPanel'
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
import { resolveWikiLinkTarget } from '@/lib/wikiLinks'
import { projectRelativePath } from '@/lib/copyPath'
import { isMarkdownFile } from '@/lib/fileKinds'
import {
  beginPathMutation,
  endPathMutation,
  isAffectedPath
} from '@/lib/pathMutationGuards'
import {
  LEFT_PANE,
  RIGHT_PANE,
  clampPaneWidth,
  persistPaneWidth,
  type PaneSpec
} from '@/lib/layout'
import { api } from '@/lib/api'
import { createPeerWindow, parseOpenParam, parseVaultParam, isBlankWindow } from '@/lib/windowManager'
import { startEventBridge } from '@/lib/eventBridge'
import { emit } from '@tauri-apps/api/event'
import { windowId, EV_PATH_MUTATED } from '@/lib/windowIdentity'
import type { TreeNode } from '../../shared/ipc'


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

  const pipeline = useSavePipeline()
  const editorRef = useRef<EditorHandle>(null)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const drawerOpen = useUiStore((s) => s.drawerOpen)
  const menu = useUiStore((s) => s.menu)
  const moveTarget = useUiStore((s) => s.moveTarget)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const searchOpen = useUiStore((s) => s.searchOpen)
  const dialog = useUiStore((s) => s.dialog)
  const leftPaneWidth = useUiStore((s) => s.leftPaneWidth)
  const rightPaneWidth = useUiStore((s) => s.rightPaneWidth)

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
    if (effective === 'dark') root.setAttribute('data-theme', 'dark')
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
        useUiStore.getState().toggleSidebar()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        useUiStore.getState().toggleDrawer()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        useUiStore.getState().toggleSettings()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useUiStore.getState().toggleSearch()
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

  function uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths))
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
    nextPaths.forEach((p) => pipeline.scheduleSave(p))
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setActiveContent(value)
    const currentPath = useDocumentStore.getState().activePath
    if (currentPath) pipeline.scheduleSave(currentPath)
  }

  const handleContextMenu = useCallback((node: TreeNode, x: number, y: number): void => {
    useUiStore.getState().openMenu({ node, x, y })
  }, [])

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await scanVaultWithSettings(root)
    useVaultStore.getState().setTree(tree)
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.alert('复制失败')
    }
  }

  /* ── Context-menu actions (driven by the dialog state machine) ── */

  const closeDialog = useCallback(() => useUiStore.getState().closeDialog(), [])

  async function doRename(node: TreeNode, name: string): Promise<void> {
    if (name === node.name) return
    const affectedPaths = affectedOpenTabPaths(node.path)
    pipeline.pauseForPaths([node.path])
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await pipeline.waitForDocumentSaves(affectedPaths)
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
      if (succeeded) {
        // tabs already renamed; nothing to restore
      } else {
        // 传 old 作 new：路径未变（IPC 失败），原地重排暂停的保存
        pipeline.resumeAfterMutation(node.path, node.path)
        guard.blockedPaths.forEach((p) => pipeline.scheduleSave(p))
      }
    }
  }

  async function doTrash(node: TreeNode): Promise<void> {
    const affectedPaths = affectedOpenTabPaths(node.path)
    pipeline.pauseForPaths([node.path])
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await pipeline.waitForDocumentSaves(affectedPaths)
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
      if (succeeded) {
        pipeline.resumeAfterMutation(node.path, null)
      } else {
        // 传 old 作 new：路径未变（IPC 失败），原地重排暂停的保存
        pipeline.resumeAfterMutation(node.path, node.path)
        guard.blockedPaths.forEach((p) => pipeline.scheduleSave(p))
      }
    }
  }

  async function doMove(node: TreeNode, destDir: string): Promise<void> {
    const affectedPaths = affectedOpenTabPaths(node.path)
    pipeline.pauseForPaths([node.path])
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await pipeline.waitForDocumentSaves(affectedPaths)
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
      if (succeeded) {
        // tabs already moved; nothing to restore
      } else {
        // 传 old 作 new：路径未变（IPC 失败），原地重排暂停的保存
        pipeline.resumeAfterMutation(node.path, node.path)
        guard.blockedPaths.forEach((p) => pipeline.scheduleSave(p))
      }
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

  const handleOpenSearch = useCallback(() => useUiStore.getState().setSearchOpen(true), [])
  const handleOpenToday = useCallback(() => void openSchedule(new Date()), [scheduleDir])
  const handleCollapseSidebar = useCallback(() => useUiStore.setState({ sidebarOpen: false }), [])
  const handleNewWindow = useCallback(() => createPeerWindow(), [])
  const handleNewNoteFromSidebar = useCallback(() => {
    const root = useVaultStore.getState().root
    const tree = useVaultStore.getState().tree
    if (!root) return
    const firstFolder = tree.find((node) => node.type === 'folder') ?? {
      name: root.split('/').filter(Boolean).pop() ?? root,
      path: root,
      type: 'folder' as const,
      children: tree
    }
    useUiStore.getState().openDialog({ kind: 'newNote', dir: firstFolder.path })
  }, [])

  function handleJumpToLine(line: number): void {
    editorRef.current?.jumpToLine(line)
  }

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
    <div className="grid h-screen overflow-hidden bg-[color:var(--app-bg)] p-0 text-foreground">
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-[color:var(--bg-elev)] shadow-[var(--shell-shadow)]">
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
            onNewNote={handleNewNoteFromSidebar}
            onOpenFile={handleOpenFile}
            onContextMenu={handleContextMenu}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => startPaneResize(e, LEFT_PANE, leftPaneWidth, (w) => useUiStore.getState().setPaneWidths(w, undefined), 1)}
            className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
          />
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={[
            'flex h-[46px] shrink-0 items-center justify-between border-b border-[color:var(--toolbar-border)] bg-[color:var(--bg-elev)] px-[10px] text-sm text-[color:var(--text-faint)]',
            sidebarOpen ? '' : 'pl-20'
          ].join(' ')}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 [-webkit-app-region:no-drag]">
            <button
              onClick={() => useUiStore.getState().toggleSidebar()}
              title={sidebarOpen ? '隐藏文件树 (⌘B)' : '显示文件树 (⌘B)'}
              aria-label={sidebarOpen ? '隐藏文件树' : '显示文件树'}
              className={[
                'grid h-[27px] w-[28px] place-items-center rounded-[7px] transition-colors',
                sidebarOpen
                  ? 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
                  : 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              ].join(' ')}
            >
              <PanelLeft size={16} />
            </button>
            <button
              onClick={handleOpenFolder}
              title="打开文件夹"
              aria-label="打开文件夹"
              className="grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <FolderOpen size={16} />
            </button>
          </div>

          <div data-tauri-drag-region className="min-w-0 flex-1" />

          <div className="relative flex flex-1 justify-end gap-1 [-webkit-app-region:no-drag]">
            {scheduleEnabled && (
              <button
                onClick={handleOpenToday}
                title="今日日程"
                aria-label="今日日程"
                className="relative grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
              >
                <CalendarDayIcon day={new Date().getDate()} />
              </button>
            )}
            <button
              onClick={() => useUiStore.getState().setSettingsOpen(true)}
              title="设置 (⌘,)"
              aria-label="设置"
              className="grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              onClick={() => useUiStore.getState().toggleDrawer()}
              title="大纲 (⌘\)"
              aria-label="切换大纲"
              className={[
                'grid h-[27px] w-[28px] place-items-center rounded-[7px] transition-colors',
                drawerOpen
                  ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              <PanelRight size={16} />
            </button>
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
                    // a file opens, moves, or a draft is applied. Store actions set
                    // path+content together, so it's current here.
                    initialValue={useDocumentStore.getState().content}
                    onChange={handleChange}
                    onSave={() => {
                      const activePath = useDocumentStore.getState().activePath
                      if (activePath && useDocumentStore.getState().isDirty(activePath)) {
                        pipeline.scheduleSave(activePath)
                      }
                      void pipeline.flushSaves()
                    }}
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
                    className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-[color:var(--accent-ink)] transition-opacity hover:opacity-90"
                  >
                    打开文件夹
                  </button>
                  <button
                    onClick={() => createPeerWindow()}
                    className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--bg-hover)]"
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
                onPointerDown={(e) => startPaneResize(e, RIGHT_PANE, rightPaneWidth, (w) => useUiStore.getState().setPaneWidths(undefined, w), -1)}
                className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
              />
              <OutlineDrawer
                width={rightPaneWidth}
                tree={vaultTree}
                scheduleDir={scheduleDir}
                onJumpToLine={handleJumpToLine}
                onOpenSchedule={(date) => void openSchedule(date)}
              />
            </>
          )}
        </div>

        <StatusBar hasFile={path !== null} />
      </div>

      {/* ── Context menu ──────────────────────────────────────── */}

      {menu && (
        <RowContextMenu
          menu={menu}
          onClose={() => useUiStore.getState().closeMenu()}
          onNewNote={(n) => {
            useUiStore.getState().closeMenu()
            useUiStore.getState().openDialog({ kind: 'newNote', dir: n.type === 'folder' ? n.path : n.path.replace(/\/[^/]+$/, '') })
          }}
          onNewFolder={(n) => {
            useUiStore.getState().closeMenu()
            useUiStore.getState().openDialog({ kind: 'newFolder', dir: n.type === 'folder' ? n.path : n.path.replace(/\/[^/]+$/, '') })
          }}
          onRename={(n) => {
            useUiStore.getState().closeMenu()
            useUiStore.getState().openDialog({ kind: 'rename', node: n })
          }}
          onMove={(n) => {
            useUiStore.getState().closeMenu()
            useUiStore.getState().setMoveTarget(n)
          }}
          onCopyFullPath={(n) => {
            useUiStore.getState().closeMenu()
            void copyText(n.path)
          }}
          onCopyRelativePath={(n) => {
            useUiStore.getState().closeMenu()
            void copyText(projectRelativePath(vaultRoot, n.path))
          }}
          onOpenInNewWindow={(n) => {
            useUiStore.getState().closeMenu()
            if (vaultRoot) {
              createPeerWindow({ filePath: n.path, vaultRoot })
            }
          }}
          onOpenInFinder={(n) => {
            useUiStore.getState().closeMenu()
            void api.openPathInFinder(n.path).catch(() => {
              window.alert('无法在 Finder 中显示')
            })
          }}
          onTrash={(n) => {
            useUiStore.getState().closeMenu()
            useUiStore.getState().openDialog({ kind: 'trash', node: n })
          }}
        />
      )}

      {/* ── Dialog state machine ──────────────────────────────── */}

      {dialog?.kind === 'newNote' && (
        <InputDialog
          title="新建笔记"
          placeholder="笔记名称"
          onConfirm={(name) => {
            const dir = dialog.dir
            closeDialog()
            void api.createNote(dir, name).then(async (created) => {
              await refreshTree()
              await openFileByPath(created)
            })
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === 'newFolder' && (
        <InputDialog
          title="新建文件夹"
          placeholder="文件夹名称"
          onConfirm={(name) => {
            const dir = dialog.dir
            closeDialog()
            void api.createFolder(dir, name).then(() => refreshTree())
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === 'rename' && (
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

      {dialog?.kind === 'trash' && (
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
            useUiStore.getState().setMoveTarget(null)
            void doMove(node, destDir)
          }}
          onClose={() => useUiStore.getState().setMoveTarget(null)}
        />
      )}

      {/* ── Settings panel ────────────────────────────────────── */}

      {settingsOpen && (
        <SettingsPanel
          tree={vaultTree}
          onClose={() => useUiStore.getState().setSettingsOpen(false)}
        />
      )}

      {/* ── Search overlay (⌘K) ───────────────────────────────── */}

      {searchOpen && vaultRoot && (
        <SearchOverlay
          tree={vaultTree}
          onOpen={(path) => void openFileByPath(path)}
          onClose={() => useUiStore.getState().setSearchOpen(false)}
        />
      )}
      </div>
    </div>
  )
}
