import { IPC, type TreeNode } from '../shared/ipc'

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
  ipcMain.handle(IPC.fileRead, (_event, ...args) => deps.readFile(args[0] as string))
  ipcMain.handle(IPC.fileWrite, (_event, ...args) =>
    deps.writeFile(args[0] as string, args[1] as string)
  )
  ipcMain.handle(IPC.vaultScan, (event, ...args) => deps.scanVault(event, args[0] as string))
  ipcMain.handle(IPC.fileCreate, (_event, ...args) =>
    deps.createNote(args[0] as string, args[1] as string)
  )
  ipcMain.handle(IPC.folderCreate, (_event, ...args) =>
    deps.createFolder(args[0] as string, args[1] as string)
  )
  ipcMain.handle(IPC.pathRename, (_event, ...args) =>
    deps.renamePath(args[0] as string, args[1] as string)
  )
  ipcMain.handle(IPC.pathTrash, (_event, ...args) => deps.trashPath(args[0] as string))
}
