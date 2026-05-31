import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type MarginApi } from '../shared/ipc'

const api: MarginApi = {
  openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
  readFile: (path) => ipcRenderer.invoke(IPC.fileRead, path),
  writeFile: (path, content) => ipcRenderer.invoke(IPC.fileWrite, path, content)
}

contextBridge.exposeInMainWorld('margin', api)
