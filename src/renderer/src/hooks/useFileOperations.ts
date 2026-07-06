import { useCallback } from 'react'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { emit } from '@tauri-apps/api/event'
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { normalizeScheduleDir, scheduleFileName, scheduleTemplate } from '@/core/schedule'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { isExternal, resolveRelative } from '@/lib/resolvePath'
import { resolveWikiLinkTarget } from '@/lib/wikiLinks'
import { isAffectedPath, beginPathMutation, endPathMutation } from '@/lib/pathMutationGuards'
import { dirname } from '@/vault-core/path'
import { windowId, EV_PATH_MUTATED } from '@/lib/windowIdentity'
import type { SavePipeline } from '@/hooks/useSavePipeline'
import type { TreeNode } from '../../../shared/ipc'

export interface FileOperations {
  openFileByPath(path: string): Promise<void>
  openLink(target: string): Promise<void>            // wiki / 相对路径 / 外链三路分发
  renameNode(node: TreeNode, newName: string): Promise<void>
  moveNode(path: string, destDir: string): Promise<void>   // 供 MoveDialog 与拖拽共用
  trashNode(node: TreeNode): Promise<void>
  createNote(dir: string, name: string): Promise<string>
  createFolder(dir: string, name: string): Promise<void>
  openScheduleNote(date: Date): Promise<void>
}

export function useFileOperations(pipeline: SavePipeline): FileOperations {

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await scanVaultWithSettings(root)
    useVaultStore.getState().setTree(tree)
  }

  async function ensureRoot(): Promise<string | null> {
    const existing = useVaultStore.getState().root
    if (existing) return existing
    const chosen = await api.openFolder()
    if (!chosen) return null
    const tree = await scanVaultWithSettings(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
    return chosen
  }

  // ── Core file operations ─────────────────────────────────────────────────

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

  const openLink = useCallback(async (url: string): Promise<void> => {
    if (url.startsWith('wiki:')) {
      const target = resolveWikiLinkTarget(url.slice(5), useVaultStore.getState().tree)
      if (target) {
        await openFileByPath(target).catch(() => {
          window.alert(`无法打开链接目标: ${url.slice(5)}`)
        })
      }
      return
    }
    if (isExternal(url)) {
      await shellOpen(url).catch(() => {})
      return
    }
    const docPath = useDocumentStore.getState().path
    const target = resolveRelative(url, docPath)
    if (target && target.endsWith('.md')) {
      await openFileByPath(target).catch(() => {
        window.alert(`无法打开链接目标: ${url}`)
      })
    }
  }, [openFileByPath])

  const renameNode = useCallback(async (node: TreeNode, newName: string): Promise<void> => {
    if (newName === node.name) return
    const affectedPaths = affectedOpenTabPaths(node.path)
    pipeline.pauseForPaths([node.path])
    const guard = beginPathMutation(node.path)
    let succeeded = false
    try {
      await pipeline.waitForDocumentSaves(affectedPaths)
      const newPath = await api.renamePath(node.path, newName)
      succeeded = true
      // newPath (IPC 返回) 是权威值——Rust 端在命名冲突时会加 -1/-2 后缀（unique_path/unique_asset_path），不能假设等于本地计算的目标路径。renamePlan/movePlan 的真正消费点见 Task 4.1 的 canMoveInto。
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
  }, [pipeline])

  const moveNode = useCallback(async (srcPath: string, destDir: string): Promise<void> => {
    // 前置守卫：同目录/自身拒绝
    if (dirname(srcPath) === destDir || srcPath === destDir) return
    const affectedPaths = affectedOpenTabPaths(srcPath)
    pipeline.pauseForPaths([srcPath])
    const guard = beginPathMutation(srcPath)
    let succeeded = false
    try {
      await pipeline.waitForDocumentSaves(affectedPaths)
      const newPath = await api.movePath(srcPath, destDir)
      succeeded = true
      // newPath (IPC 返回) 是权威值——Rust 端在命名冲突时会加 -1/-2 后缀（unique_path/unique_asset_path），不能假设等于本地计算的目标路径。renamePlan/movePlan 的真正消费点见 Task 4.1 的 canMoveInto。
      replaceAffectedOpenTabPaths(srcPath, newPath)
      void emit(EV_PATH_MUTATED, { action: 'move', oldPath: srcPath, newPath, _source: windowId })
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
        pipeline.resumeAfterMutation(srcPath, srcPath)
        guard.blockedPaths.forEach((p) => pipeline.scheduleSave(p))
      }
    }
  }, [pipeline])

  const trashNode = useCallback(async (node: TreeNode): Promise<void> => {
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
  }, [pipeline])

  const createNote = useCallback(async (dir: string, name: string): Promise<string> => {
    const created = await api.createNote(dir, name)
    await refreshTree()
    await openFileByPath(created)
    return created
  }, [openFileByPath])

  const createFolder = useCallback(async (dir: string, name: string): Promise<void> => {
    await api.createFolder(dir, name)
    await refreshTree()
  }, [])

  const openScheduleNote = useCallback(async (date: Date): Promise<void> => {
    const root = await ensureRoot()
    if (!root) return
    const scheduleDir = useSettingsStore.getState().scheduleDir
    const cleanScheduleDir = normalizeScheduleDir(scheduleDir) || '日程'
    const dirPath = `${root}/${cleanScheduleDir}`
    const created = await api.ensureNote(
      dirPath,
      scheduleFileName(date),
      scheduleTemplate(date)
    )
    await refreshTree()
    await openFileByPath(created)
  }, [openFileByPath])

  return {
    openFileByPath,
    openLink,
    renameNode,
    moveNode,
    trashNode,
    createNote,
    createFolder,
    openScheduleNote,
  }
}
