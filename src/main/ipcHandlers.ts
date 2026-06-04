import { IPC, type TreeNode } from '../shared/ipc'
import { assertSafePath } from './pathPolicy'

export interface IpcHandlerDeps {
  dialogOpenFile(): Promise<string | null>
  dialogOpenFolder(): Promise<string | null>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  scanVault(event: unknown, root: string): TreeNode[] | Promise<TreeNode[]>
  createNote(dir: string, name: string): Promise<string>
  createFolder(dir: string, name: string): Promise<string>
  renamePath(oldPath: string, newName: string): Promise<string>
  trashPath(path: string): Promise<void>
}

export interface MinimalIpcMain {
  handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void
}

export function registerIpcHandlers(ipcMain: MinimalIpcMain, deps: IpcHandlerDeps): void {
  ipcMain.handle(IPC.dialogOpenFile, () => deps.dialogOpenFile())
  ipcMain.handle(IPC.dialogOpenFolder, () => deps.dialogOpenFolder())
  ipcMain.handle(IPC.fileRead, (_event, ...args) => {
    const path = args[0] as string
    assertSafePath(path)
    return deps.readFile(path)
  })
  ipcMain.handle(IPC.fileWrite, (_event, ...args) => {
    const path = args[0] as string
    assertSafePath(path)
    return deps.writeFile(path, args[1] as string)
  })
  ipcMain.handle(IPC.vaultScan, (event, ...args) => {
    const root = args[0] as string
    assertSafePath(root)
    return deps.scanVault(event, root)
  })
  ipcMain.handle(IPC.fileCreate, (_event, ...args) => {
    const dir = args[0] as string
    const name = args[1] as string
    assertSafePath(dir)
    assertSafePath(name)
    return deps.createNote(dir, name)
  })
  ipcMain.handle(IPC.folderCreate, (_event, ...args) => {
    const dir = args[0] as string
    const name = args[1] as string
    assertSafePath(dir)
    assertSafePath(name)
    return deps.createFolder(dir, name)
  })
  ipcMain.handle(IPC.pathRename, (_event, ...args) => {
    const oldPath = args[0] as string
    const newName = args[1] as string
    assertSafePath(oldPath)
    assertSafePath(newName)
    return deps.renamePath(oldPath, newName)
  })
  ipcMain.handle(IPC.pathTrash, (_event, ...args) => {
    const path = args[0] as string
    assertSafePath(path)
    return deps.trashPath(path)
  })
}
