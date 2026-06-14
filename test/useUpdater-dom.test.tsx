// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useUpdater } from '@/hooks/useUpdater'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCurrentVersion: vi.fn(),
    checkUpdate: vi.fn(),
    downloadAndInstallUpdate: vi.fn(),
    relaunch: vi.fn()
  }
}))

const mockedApi = vi.mocked(api)

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

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.getCurrentVersion.mockResolvedValue('2.0.0')
  mockedApi.checkUpdate.mockResolvedValue({ available: false, currentVersion: '2.0.0' })
  mockedApi.downloadAndInstallUpdate.mockResolvedValue(undefined)
  mockedApi.relaunch.mockResolvedValue(undefined)
})

describe('useUpdater', () => {
  it('loads the current version into idle state', async () => {
    const { result } = renderHook(() => useUpdater())

    await waitFor(() => {
      expect(result.current.status).toEqual({ state: 'idle', currentVersion: '2.0.0' })
    })
  })

  it('reports no update available', async () => {
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'not-available',
      currentVersion: '2.0.0'
    })
  })

  it('reports an available update', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'available',
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })
  })

  it('does not let late initial version load clobber a completed check result', async () => {
    const initialVersion = deferred<string>()
    mockedApi.getCurrentVersion
      .mockReturnValueOnce(initialVersion.promise)
      .mockResolvedValue('2.0.0')
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'available',
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: undefined,
      body: undefined
    })

    await act(async () => {
      initialVersion.resolve('2.0.0')
      await initialVersion.promise
    })

    expect(result.current.status).toEqual({
      state: 'available',
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: undefined,
      body: undefined
    })
  })

  it('deduplicates concurrent checks before the current version has loaded', async () => {
    const version = deferred<string>()
    mockedApi.getCurrentVersion.mockReturnValue(version.promise)
    mockedApi.checkUpdate.mockResolvedValue({
      available: false,
      currentVersion: '2.0.0'
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      const firstCheck = result.current.check()
      const secondCheck = result.current.check()
      version.resolve('2.0.0')
      await Promise.all([firstCheck, secondCheck])
    })

    expect(mockedApi.checkUpdate).toHaveBeenCalledOnce()
    expect(result.current.status).toEqual({
      state: 'not-available',
      currentVersion: '2.0.0'
    })
  })

  it('downloads, installs, and relaunches an available update', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    mockedApi.downloadAndInstallUpdate.mockImplementation(async (onProgress) => {
      onProgress({ event: 'Started', contentLength: 100 })
      onProgress({ event: 'Progress', chunkLength: 25 })
      onProgress({ event: 'Progress', chunkLength: 75 })
      onProgress({ event: 'Finished' })
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
      await result.current.install()
    })

    expect(mockedApi.downloadAndInstallUpdate).toHaveBeenCalledOnce()
    expect(mockedApi.relaunch).toHaveBeenCalledOnce()
    expect(result.current.status).toEqual({
      state: 'installing',
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
  })

  it('does not start a new check while installing', async () => {
    const relaunch = deferred<void>()
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    mockedApi.downloadAndInstallUpdate.mockImplementation(async (onProgress) => {
      onProgress({ event: 'Finished' })
    })
    mockedApi.relaunch.mockReturnValue(relaunch.promise)
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    let installPromise!: Promise<void>
    await act(async () => {
      installPromise = result.current.install()
    })

    await waitFor(() => {
      expect(result.current.status).toEqual({
        state: 'installing',
        currentVersion: '2.0.0',
        version: '2.1.0'
      })
    })

    await act(async () => {
      await result.current.check()
    })

    expect(mockedApi.checkUpdate).toHaveBeenCalledOnce()

    await act(async () => {
      relaunch.resolve()
      await installPromise
    })
  })

  it('surfaces check errors with the current version', async () => {
    mockedApi.checkUpdate.mockRejectedValue(new Error('network fail'))
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'error',
      currentVersion: '2.0.0',
      message: 'network fail'
    })
  })

  it('reports manual restart when relaunch fails after install', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    mockedApi.relaunch.mockRejectedValue(new Error('restart blocked'))
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
      await result.current.install()
    })

    expect(result.current.status).toEqual({
      state: 'error',
      currentVersion: '2.0.0',
      message: '更新已安装，但无法自动重启。请手动重启 Margin。'
    })
  })
})
