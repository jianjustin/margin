import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '../shared/ipc'
import { scanVault } from './vaultScanner'
import { watchVault } from './fileWatcher'
import { createNote, createFolder, renamePath, trashPath } from './fsOps'
import { registerIpcHandlers, type IpcHandlerDeps } from './ipcHandlers'

let stopWatch: (() => void) | null = null

function armWatcher(win: BrowserWindow, root: string): void {
  stopWatch?.()
  stopWatch = watchVault(root, () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.vaultChanged, root)
  })
}

function makeIpcDeps(): IpcHandlerDeps {
  return {
    dialogOpenFile: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
    dialogOpenFolder: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
    readFile: async (path) => {
      try {
        return await readFile(path, 'utf-8')
      } catch (err) {
        console.error(`Failed to read ${path}:`, err)
        throw new Error(`Could not read file: ${(err as Error).message}`)
      }
    },
    writeFile: async (path, content) => {
      try {
        await writeFile(path, content, 'utf-8')
      } catch (err) {
        console.error(`Failed to write ${path}:`, err)
        throw new Error(`Could not save file: ${(err as Error).message}`)
      }
    },
    scanVault: (event, root) => {
      const win = BrowserWindow.fromWebContents((event as Electron.IpcMainInvokeEvent).sender)
      if (win) armWatcher(win, root)
      return scanVault(root)
    },
    createNote,
    createFolder,
    renamePath,
    trashPath
  }
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
  registerIpcHandlers(ipcMain, makeIpcDeps())
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
