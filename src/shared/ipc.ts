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
  scanVault(root: string, hiddenFolders: string[]): Promise<TreeNode[]>
  createNote(dir: string, name: string): Promise<string>
  createFolder(dir: string, name: string): Promise<string>
  renamePath(oldPath: string, newName: string): Promise<string>
  trashPath(path: string): Promise<void>
  movePath(srcPath: string, destDir: string): Promise<string>
  ensureNote(dir: string, name: string, template?: string): Promise<string>
  /** Read `<root>/.margin/config.json`; null when no config has been written. */
  readProjectConfig(root: string): Promise<string | null>
  /** Write `<root>/.margin/config.json`, creating the hidden dir if needed. */
  writeProjectConfig(root: string, content: string): Promise<void>
  onVaultChanged(callback: (root: string) => void): () => void
  /** Crash-recovery drafts stored under `<root>/.margin/drafts/`. */
  writeDraft(root: string, path: string, content: string): Promise<void>
  readDraft(root: string, path: string): Promise<string | null>
  deleteDraft(root: string, path: string): Promise<void>
}
