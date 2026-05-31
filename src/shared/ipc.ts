export const IPC = {
  dialogOpenFile: 'dialog:openFile',
  dialogOpenFolder: 'dialog:openFolder',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  vaultScan: 'vault:scan',
  fileCreate: 'file:create',
  folderCreate: 'folder:create',
  pathRename: 'path:rename',
  pathTrash: 'path:trash',
  vaultChanged: 'vault:changed'
} as const

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
}

export interface MarginApi {
  openFile(): Promise<string | null>
  openFolder(): Promise<string | null>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  scanVault(root: string): Promise<TreeNode[]>
  createNote(dir: string, name: string): Promise<string>
  createFolder(dir: string, name: string): Promise<string>
  renamePath(oldPath: string, newName: string): Promise<string>
  trashPath(path: string): Promise<void>
  onVaultChanged(callback: (root: string) => void): () => void
}
