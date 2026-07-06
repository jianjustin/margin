import { useEffect, useRef, useCallback } from 'react'
import { useSavePipeline } from '@/hooks/useSavePipeline'
import { AppHeader } from '@/components/AppHeader'
import { SearchOverlay } from '@/components/SearchOverlay'
import { Editor, type EditorHandle } from '@/components/Editor'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
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
import { useFileOperations } from '@/hooks/useFileOperations'
import { useGlobalKeymap } from '@/hooks/useGlobalKeymap'
import { DraftBanner } from '@/components/DraftBanner'
import { ConflictBar } from '@/components/ConflictBar'
import { StatusBar } from '@/components/StatusBar'
import { isMarkdownFile } from '@/lib/fileKinds'
import { LEFT_PANE, RIGHT_PANE } from '@/lib/layout'
import { usePaneResize } from '@/hooks/usePaneResize'
import { api } from '@/lib/api'
import { createPeerWindow } from '@/lib/windowManager'
import { useVaultBoot } from '@/hooks/useVaultBoot'
import { useRowContextMenuActions } from '@/hooks/useRowContextMenuActions'
import type { TreeNode } from '../../shared/ipc'

export default function App(): JSX.Element {
  // Only active-document identity and tab presence are subscribed here — a
  // keystroke changes active tab content, not these values, so App (and the
  // file-tree subtree below it) does NOT re-render while typing. Content is
  // consumed by leaf subscribers: the editor reads it non-reactively on
  // (re)mount, the dirty dot and status bar subscribe to it themselves.
  const path = useDocumentStore((s) => s.path)
  const epoch = useDocumentStore((s) => s.epoch)

  const pipeline = useSavePipeline()
  const fileOps = useFileOperations(pipeline)
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

  useVaultBoot()

  /* ── Global keyboard shortcuts ─────────────────────────────── */

  useGlobalKeymap()

  /* ── Core file operations ──────────────────────────────────── */

  // Stable identities so the memoized <Sidebar> doesn't reconcile the whole
  // file tree when App re-renders for unrelated reasons (dialogs, drawer/theme).
  const openFolder = useCallback(async (): Promise<void> => {
    const chosen = await api.openFolder()
    if (!chosen) return
    const tree = await scanVaultWithSettings(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
  }, [])

  const handleOpenLink = useCallback((url: string) => void fileOps.openLink(url), [fileOps])

  const handleOpenFolder = useCallback(() => void openFolder(), [openFolder])
  const handleOpenFile = useCallback(
    (node: TreeNode) => {
      if (node.type !== 'file' || !isMarkdownFile(node.name)) return
      void fileOps.openFileByPath(node.path)
    },
    [fileOps]
  )

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

  /* ── Context-menu actions (driven by the dialog state machine) ── */

  const rowMenuActions = useRowContextMenuActions(vaultRoot)
  const closeDialog = useCallback(() => useUiStore.getState().closeDialog(), [])

  const handleOpenSearch = useCallback(() => useUiStore.getState().setSearchOpen(true), [])
  const handleOpenToday = useCallback(() => void fileOps.openScheduleNote(new Date()), [fileOps])
  const handleCollapseSidebar = useCallback(() => useUiStore.getState().collapseSidebar(), [])
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

  const startPaneResize = usePaneResize()

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
        <AppHeader
          sidebarOpen={sidebarOpen}
          drawerOpen={drawerOpen}
          scheduleEnabled={scheduleEnabled}
          onToggleSidebar={() => useUiStore.getState().toggleSidebar()}
          onOpenFolder={handleOpenFolder}
          onOpenToday={handleOpenToday}
          onOpenSettings={() => useUiStore.getState().setSettingsOpen(true)}
          onToggleDrawer={() => useUiStore.getState().toggleDrawer()}
        />

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
                onOpenSchedule={(date) => void fileOps.openScheduleNote(date)}
              />
            </>
          )}
        </div>

        <StatusBar hasFile={path !== null} />
      </div>

      {/* ── Context menu ──────────────────────────────────────── */}

      {menu && <RowContextMenu menu={menu} {...rowMenuActions} />}

      {/* ── Dialog state machine ──────────────────────────────── */}

      {dialog?.kind === 'newNote' && (
        <InputDialog
          title="新建笔记"
          placeholder="笔记名称"
          onConfirm={(name) => {
            const dir = dialog.dir
            closeDialog()
            void fileOps.createNote(dir, name)
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
            void fileOps.createFolder(dir, name)
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
            void fileOps.renameNode(node, name)
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
            void fileOps.trashNode(node)
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
            void fileOps.moveNode(node.path, destDir)
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
          onOpen={(path) => void fileOps.openFileByPath(path)}
          onClose={() => useUiStore.getState().setSearchOpen(false)}
        />
      )}
      </div>
    </div>
  )
}
