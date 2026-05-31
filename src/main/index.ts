import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '../shared/ipc'
import { scanVault } from './vaultScanner'
import { watchVault } from './fileWatcher'

let stopWatch: (() => void) | null = null

function armWatcher(win: BrowserWindow, root: string): void {
  stopWatch?.()
  stopWatch = watchVault(root, () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.vaultChanged, root)
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.dialogOpenFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.fileRead, async (_event, path: string) => {
    try {
      return await readFile(path, 'utf-8')
    } catch (err) {
      console.error(`Failed to read ${path}:`, err)
      throw new Error(`Could not read file: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(IPC.fileWrite, async (_event, path: string, content: string) => {
    try {
      await writeFile(path, content, 'utf-8')
    } catch (err) {
      console.error(`Failed to write ${path}:`, err)
      throw new Error(`Could not save file: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.vaultScan, (event, root: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) armWatcher(win, root)
    return scanVault(root)
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopWatch?.()
})
