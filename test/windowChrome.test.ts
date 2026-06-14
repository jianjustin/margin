import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const APP_SOURCE = 'src/renderer/src/App.tsx'
const TAURI_CONFIG = 'src-tauri/tauri.conf.json'
const CAPABILITIES = 'src-tauri/capabilities/default.json'

describe('window chrome behavior', () => {
  it('uses Tauri drag regions instead of relying on Electron-only app-region CSS', () => {
    const source = readFileSync(APP_SOURCE, 'utf8')

    expect(source).toContain('data-tauri-drag-region')
  })

  it('keeps the main window movable, resizable, and maximizable without a native titlebar gutter', () => {
    const config = JSON.parse(readFileSync(TAURI_CONFIG, 'utf8'))
    const [mainWindow] = config.app.windows

    expect(mainWindow.titleBarStyle).toBe('Overlay')
    expect(mainWindow.resizable).toBe(true)
    expect(mainWindow.maximizable).toBe(true)
    expect(mainWindow.acceptFirstMouse).toBe(true)
  })

  it('allows the renderer drag region to call Tauri window dragging', () => {
    expect(existsSync(CAPABILITIES)).toBe(true)

    const capability = JSON.parse(readFileSync(CAPABILITIES, 'utf8'))

    expect(capability.windows).toContain('main')
    expect(capability.permissions).toContain('core:window:allow-start-dragging')
  })
})
