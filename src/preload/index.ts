import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type MarginApi } from '../shared/ipc'

const api: MarginApi = {
  openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
  openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
  readFile: (path) => ipcRenderer.invoke(IPC.fileRead, path),
  writeFile: (path, content) => ipcRenderer.invoke(IPC.fileWrite, path, content),
  scanVault: (root) => ipcRenderer.invoke(IPC.vaultScan, root),
  createNote: (dir, name) => ipcRenderer.invoke(IPC.fileCreate, dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke(IPC.folderCreate, dir, name),
  renamePath: (oldPath, newName) => ipcRenderer.invoke(IPC.pathRename, oldPath, newName),
  trashPath: (path) => ipcRenderer.invoke(IPC.pathTrash, path),
  onVaultChanged: (callback) => {
    const listener = (_e: unknown, root: string): void => callback(root)
    ipcRenderer.on(IPC.vaultChanged, listener)
    return () => ipcRenderer.removeListener(IPC.vaultChanged, listener)
  }
}

contextBridge.exposeInMainWorld('margin', api)
