import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()
const getVersion = vi.fn()
const check = vi.fn()
const relaunch = vi.fn()

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
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

  it('closes the consumed update after a successful install', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    await api.downloadAndInstallUpdate(() => {})

    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
    expect(update.close).toHaveBeenCalledOnce()
  })

  it('closes the consumed update after a failed install', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async () => {
        throw new Error('install failed')
      }),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow('install failed')

    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
    expect(update.close).toHaveBeenCalledOnce()
  })

  it('clears a previous pending update before checking again', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValueOnce(update).mockRejectedValueOnce(new Error('check failed'))

    await api.checkUpdate()
    await expect(api.checkUpdate()).rejects.toThrow('check failed')
    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow(
      'No update available to install'
    )
    expect(update.downloadAndInstall).not.toHaveBeenCalled()
    expect(update.close).toHaveBeenCalledOnce()
  })

  it('closes the previous pending update before replacing it', async () => {
    const firstUpdate = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    const secondUpdate = {
      currentVersion: '2.0.0',
      version: '2.2.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValueOnce(firstUpdate).mockResolvedValueOnce(secondUpdate)

    await api.checkUpdate()
    await api.checkUpdate()

    expect(firstUpdate.close).toHaveBeenCalledOnce()
    expect(secondUpdate.close).not.toHaveBeenCalled()

    await api.downloadAndInstallUpdate(() => {})
  })

  it('keeps the newest pending update when concurrent checks resolve out of order', async () => {
    const firstUpdate = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    const secondUpdate = {
      currentVersion: '2.0.0',
      version: '2.2.0',
      downloadAndInstall: vi.fn(async () => {}),
      close: vi.fn(() => Promise.resolve())
    }
    const firstResult = deferred<typeof firstUpdate>()
    const secondResult = deferred<typeof secondUpdate>()
    check
      .mockReturnValueOnce(firstResult.promise)
      .mockReturnValueOnce(secondResult.promise)

    const firstCheck = api.checkUpdate()
    await Promise.resolve()
    expect(check).toHaveBeenCalledOnce()

    const secondCheck = api.checkUpdate()
    await Promise.resolve()
    expect(check).toHaveBeenCalledTimes(2)

    secondResult.resolve(secondUpdate)
    await expect(secondCheck).resolves.toMatchObject({ available: true, version: '2.2.0' })

    firstResult.resolve(firstUpdate)
    await expect(firstCheck).resolves.toEqual({
      available: false,
      currentVersion: '2.0.0'
    })

    await api.downloadAndInstallUpdate(() => {})

    expect(firstUpdate.downloadAndInstall).not.toHaveBeenCalled()
    expect(firstUpdate.close).toHaveBeenCalledOnce()
    expect(secondUpdate.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('forwards updater download events', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'Started', data: { contentLength: 100 } })
        onEvent({ event: 'Progress', data: { chunkLength: 40 } })
        onEvent({ event: 'Finished' })
      }),
      close: vi.fn(() => Promise.resolve())
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

  it('clears the pending update before a failed install', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi
        .fn()
        .mockRejectedValueOnce(new Error('install failed'))
        .mockResolvedValueOnce(undefined),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow('install failed')
    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow(
      'No update available to install'
    )
    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('allows only one install attempt for a checked update', async () => {
    let finishInstall!: () => void
    const installPromise = new Promise<void>((resolve) => {
      finishInstall = resolve
    })
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(() => installPromise),
      close: vi.fn(() => Promise.resolve())
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    const firstInstall = api.downloadAndInstallUpdate(() => {})
    const secondInstall = api.downloadAndInstallUpdate(() => {})
    finishInstall()

    await expect(firstInstall).resolves.toBeUndefined()
    await expect(secondInstall).rejects.toThrow('No update available to install')
    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('relaunches through the process plugin', async () => {
    await api.relaunch()
    expect(relaunch).toHaveBeenCalledOnce()
  })
})
