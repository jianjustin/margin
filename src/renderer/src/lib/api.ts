import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { MarginApi, TreeNode } from '../../../shared/ipc'

export const api: MarginApi = {
  openFile: () => invoke<string | null>('open_file_dialog'),
  openFolder: () => invoke<string | null>('open_folder_dialog'),
  readFile: (path) => invoke<string>('read_file', { path }),
  writeFile: (path, content) => invoke<void>('write_file', { path, content }),
  scanVault: (root) => invoke<TreeNode[]>('scan_vault', { root }),
  createNote: (dir, name) => invoke<string>('create_note', { dir, name }),
  createFolder: (dir, name) => invoke<string>('create_folder', { dir, name }),
  renamePath: (oldPath, newName) => invoke<string>('rename_path', { old_path: oldPath, new_name: newName }),
  trashPath: (path) => invoke<void>('trash_path', { path }),
  movePath: (srcPath, destDir) => invoke<string>('move_path', { src_path: srcPath, dest_dir: destDir }),
  ensureNote: (dir, name, template) => invoke<string>('ensure_note', { dir, name, template: template ?? '' }),
  onVaultChanged: (callback) => {
    let unlisten: (() => void) | null = null
    listen<string>('vault-changed', (event) => callback(event.payload))
      .then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }
}
