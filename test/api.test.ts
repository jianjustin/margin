import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()
const getVersion = vi.fn()
const check = vi.fn()
const relaunch = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args)
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listen(...args)
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => getVersion()
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => check()
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => relaunch()
}))

import { api } from '@/lib/api'

describe('api command arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue(undefined)
    listen.mockResolvedValue(() => {})
    getVersion.mockResolvedValue('2.0.0')
    check.mockResolvedValue(null)
    relaunch.mockResolvedValue(undefined)
  })

  it('uses Tauri camelCase argument keys for multi-word command params', async () => {
    await api.scanVault('/vault', ['.claude'])
    expect(invoke).toHaveBeenLastCalledWith('scan_vault', {
      root: '/vault',
      hiddenFolders: ['.claude']
    })

    await api.renamePath('/vault/a.md', 'b.md')
    expect(invoke).toHaveBeenLastCalledWith('rename_path', {
      oldPath: '/vault/a.md',
      newName: 'b.md'
    })

    await api.movePath('/vault/a.md', '/vault/Target')
    expect(invoke).toHaveBeenLastCalledWith('move_path', {
      srcPath: '/vault/a.md',
      destDir: '/vault/Target'
    })

    await api.openPathInFinder('/vault/a.md')
    expect(invoke).toHaveBeenLastCalledWith('open_path_in_finder', {
      path: '/vault/a.md'
    })
  })

  it('returns the current app version', async () => {
    await expect(api.getCurrentVersion()).resolves.toBe('2.0.0')
    expect(getVersion).toHaveBeenCalledOnce()
  })

  it('normalizes a no-update result', async () => {
    check.mockResolvedValue(null)

    await expect(api.checkUpdate()).resolves.toEqual({
      available: false,
      currentVersion: '2.0.0'
    })
  })

  it('normalizes an available update and stores it for install', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes',
      downloadAndInstall: vi.fn(async () => {})
    }
    check.mockResolvedValue(update)

    await expect(api.checkUpdate()).resolves.toEqual({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })

    await api.downloadAndInstallUpdate(() => {})
    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('forwards updater download events', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'Started', data: { contentLength: 100 } })
        onEvent({ event: 'Progress', data: { chunkLength: 40 } })
        onEvent({ event: 'Finished' })
      })
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    const events: unknown[] = []
    await api.downloadAndInstallUpdate((event) => events.push(event))

    expect(events).toEqual([
      { event: 'Started', contentLength: 100 },
      { event: 'Progress', chunkLength: 40 },
      { event: 'Finished' }
    ])
  })

  it('throws when install is requested without an available update', async () => {
    check.mockResolvedValue(null)
    await api.checkUpdate()

    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow(
      'No update available to install'
    )
  })

  it('relaunches through the process plugin', async () => {
    await api.relaunch()
    expect(relaunch).toHaveBeenCalledOnce()
  })
})
