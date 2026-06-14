import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import type {
  MarginApi,
  TreeNode,
  UpdateCheckResult,
  UpdateDownloadProgress
} from '../../../shared/ipc'

let pendingUpdate: Update | null = null
let latestCheckId = 0

function closeUpdate(update: Update | null): void {
  if (!update) return
  void update.close().catch(() => {})
}

function normalizeDownloadEvent(event: DownloadEvent): UpdateDownloadProgress {
  if (event.event === 'Started') {
    return { event: 'Started', contentLength: event.data.contentLength }
  }
  if (event.event === 'Progress') {
    return { event: 'Progress', chunkLength: event.data.chunkLength }
  }
  return { event: 'Finished' }
}

export const api: MarginApi = {
  openFile: () => invoke<string | null>('open_file_dialog'),
  openFolder: () => invoke<string | null>('open_folder_dialog'),
  readFile: (path) => invoke<string>('read_file', { path }),
  writeFile: (path, content) => invoke<void>('write_file', { path, content }),
  scanVault: (root, hiddenFolders) => invoke<TreeNode[]>('scan_vault', { root, hiddenFolders }),
  createNote: (dir, name) => invoke<string>('create_note', { dir, name }),
  createFolder: (dir, name) => invoke<string>('create_folder', { dir, name }),
  renamePath: (oldPath, newName) => invoke<string>('rename_path', { oldPath, newName }),
  trashPath: (path) => invoke<void>('trash_path', { path }),
  movePath: (srcPath, destDir) => invoke<string>('move_path', { srcPath, destDir }),
  openPathInFinder: (path) => invoke<void>('open_path_in_finder', { path }),
  ensureNote: (dir, name, template) => invoke<string>('ensure_note', { dir, name, template: template ?? '' }),
  readProjectConfig: (root) => invoke<string | null>('read_project_config', { root }),
  writeProjectConfig: (root, content) => invoke<void>('write_project_config', { root, content }),
  writeDraft: (root, path, content) => invoke<void>('write_draft', { root, path, content }),
  readDraft: (root, path) => invoke<string | null>('read_draft', { root, path }),
  deleteDraft: (root, path) => invoke<void>('delete_draft', { root, path }),
  getCurrentVersion: () => getVersion(),
  checkUpdate: async (): Promise<UpdateCheckResult> => {
    const checkId = latestCheckId + 1
    latestCheckId = checkId
    closeUpdate(pendingUpdate)
    pendingUpdate = null
    const currentVersion = await getVersion()
    if (checkId !== latestCheckId) return { available: false, currentVersion }
    const update = await check()
    if (checkId !== latestCheckId) {
      closeUpdate(update)
      return { available: false, currentVersion }
    }
    pendingUpdate = update
    if (!update) return { available: false, currentVersion }
    return {
      available: true,
      currentVersion: update.currentVersion || currentVersion,
      version: update.version,
      date: update.date,
      body: update.body
    }
  },
  downloadAndInstallUpdate: async (onProgress): Promise<void> => {
    const update = pendingUpdate
    pendingUpdate = null
    if (!update) throw new Error('No update available to install')
    try {
      await update.downloadAndInstall((event) => onProgress(normalizeDownloadEvent(event)))
    } finally {
      closeUpdate(update)
    }
  },
  relaunch: () => relaunch(),
  onVaultChanged: (callback) => {
    let unlisten: (() => void) | null = null
    listen<string>('vault-changed', (event) => callback(event.payload))
      .then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }
}
