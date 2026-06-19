export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
}

export type UpdateCheckResult =
  | { available: false; currentVersion: string }
  | {
      available: true
      currentVersion: string
      version: string
      date?: string
      body?: string
    }

export type UpdateDownloadProgress =
  | { event: 'Started'; contentLength?: number }
  | { event: 'Progress'; chunkLength: number }
  | { event: 'Finished' }

export type UpdateStatus =
  | { state: 'idle'; currentVersion: string }
  | { state: 'checking'; currentVersion: string }
  | { state: 'not-available'; currentVersion: string }
  | {
      state: 'available'
      currentVersion: string
      version: string
      date?: string
      body?: string
    }
  | {
      state: 'downloading'
      currentVersion: string
      version: string
      downloadedBytes: number
      contentLength?: number
      percent?: number
    }
  | { state: 'installing'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string }

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
  openPathInFinder(path: string): Promise<void>
  ensureNote(dir: string, name: string, template?: string): Promise<string>
  importAssetFromPath(root: string, sourcePath: string, assetsDir: string): Promise<string>
  writeAssetBytes(root: string, fileName: string, bytes: number[], assetsDir: string): Promise<string>
  readAssetBytes(path: string): Promise<number[]>
  readAssetDataUrl(path: string): Promise<string>
  readRemoteDataUrl(url: string): Promise<string>
  cacheRemoteMedia(url: string): Promise<string>
  renderRemoteDiagram(serverUrl: string, kind: string, code: string): Promise<string>
  /** Read `<root>/.margin/config.json`; null when no config has been written. */
  readProjectConfig(root: string): Promise<string | null>
  /** Write `<root>/.margin/config.json`, creating the hidden dir if needed. */
  writeProjectConfig(root: string, content: string): Promise<void>
  onVaultChanged(callback: (root: string) => void): () => void
  /** Crash-recovery drafts stored under `<root>/.margin/drafts/`. */
  writeDraft(root: string, path: string, content: string): Promise<void>
  readDraft(root: string, path: string): Promise<string | null>
  deleteDraft(root: string, path: string): Promise<void>
  getCurrentVersion(): Promise<string>
  checkUpdate(): Promise<UpdateCheckResult>
  downloadAndInstallUpdate(
    onProgress: (progress: UpdateDownloadProgress) => void
  ): Promise<void>
  relaunch(): Promise<void>
}
