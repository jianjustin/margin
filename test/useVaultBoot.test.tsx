// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVaultBoot } from '@/hooks/useVaultBoot'

const win = vi.hoisted(() => ({
  parseOpenParam: vi.fn<[], string | null>(),
  parseVaultParam: vi.fn<[], string | null>(),
  isBlankWindow: vi.fn<[], boolean>()
}))

const bridge = vi.hoisted(() => ({
  startEventBridge: vi.fn(() => vi.fn())
}))

const scan = vi.hoisted(() => ({
  scanVaultWithSettings: vi.fn<[string], Promise<unknown[]>>()
}))

const apiMock = vi.hoisted(() => ({
  readFile: vi.fn<[string], Promise<string | null>>()
}))

const vaultActions = vi.hoisted(() => ({
  openRoot: vi.fn(),
  select: vi.fn(),
  closeVault: vi.fn()
}))

const docActions = vi.hoisted(() => ({
  openOrActivate: vi.fn()
}))

const vaultBoot = vi.hoisted(() => ({
  loadPersistedRoot: vi.fn<[], string | null>()
}))

vi.mock('@/lib/windowManager', () => ({
  parseOpenParam: win.parseOpenParam,
  parseVaultParam: win.parseVaultParam,
  isBlankWindow: win.isBlankWindow
}))
vi.mock('@/lib/eventBridge', () => ({ startEventBridge: bridge.startEventBridge }))
vi.mock('@/lib/scanVault', () => ({ scanVaultWithSettings: scan.scanVaultWithSettings }))
vi.mock('@/lib/api', () => ({ api: { readFile: apiMock.readFile } }))
vi.mock('@/stores/vaultStore', () => ({
  useVaultStore: { getState: () => vaultActions },
  loadPersistedRoot: vaultBoot.loadPersistedRoot
}))
vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: { getState: () => docActions }
}))

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  win.parseOpenParam.mockReturnValue(null)
  win.parseVaultParam.mockReturnValue(null)
  win.isBlankWindow.mockReturnValue(false)
  scan.scanVaultWithSettings.mockResolvedValue([{ name: 'a.md', path: '/v/a.md', type: 'file' }])
  apiMock.readFile.mockResolvedValue('hello')
  vaultBoot.loadPersistedRoot.mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useVaultBoot', () => {
  it('starts the event bridge on mount and stops it on unmount', () => {
    const stop = vi.fn()
    bridge.startEventBridge.mockReturnValue(stop)
    // A resolvable role (main window with a saved root) so the effect reaches
    // its `return stopBridge` cleanup path.
    vaultBoot.loadPersistedRoot.mockReturnValue('/saved')
    const { unmount } = renderHook(() => useVaultBoot())
    expect(bridge.startEventBridge).toHaveBeenCalledTimes(1)
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('open+vault params: opens the target vault and file', async () => {
    win.parseOpenParam.mockReturnValue('/v/a.md')
    win.parseVaultParam.mockReturnValue('/v')

    renderHook(() => useVaultBoot())
    await flush()

    expect(scan.scanVaultWithSettings).toHaveBeenCalledWith('/v')
    expect(vaultActions.openRoot).toHaveBeenCalledWith('/v', expect.any(Array))
    expect(apiMock.readFile).toHaveBeenCalledWith('/v/a.md')
    expect(docActions.openOrActivate).toHaveBeenCalledWith('/v/a.md', 'hello')
    expect(vaultActions.select).toHaveBeenCalledWith('/v/a.md')
    expect(vaultBoot.loadPersistedRoot).not.toHaveBeenCalled()
  })

  it('open+vault params: closeVault on scan failure', async () => {
    win.parseOpenParam.mockReturnValue('/v/a.md')
    win.parseVaultParam.mockReturnValue('/v')
    scan.scanVaultWithSettings.mockRejectedValueOnce(new Error('boom'))

    renderHook(() => useVaultBoot())
    await flush()

    expect(vaultActions.closeVault).toHaveBeenCalledTimes(1)
    expect(vaultActions.openRoot).not.toHaveBeenCalled()
  })

  it('blank window: does not scan or restore', async () => {
    win.isBlankWindow.mockReturnValue(true)

    renderHook(() => useVaultBoot())
    await flush()

    expect(scan.scanVaultWithSettings).not.toHaveBeenCalled()
    expect(vaultBoot.loadPersistedRoot).not.toHaveBeenCalled()
    expect(vaultActions.openRoot).not.toHaveBeenCalled()
  })

  it('main window: restores the persisted vault root', async () => {
    vaultBoot.loadPersistedRoot.mockReturnValue('/saved')

    renderHook(() => useVaultBoot())
    await flush()

    expect(scan.scanVaultWithSettings).toHaveBeenCalledWith('/saved')
    expect(vaultActions.openRoot).toHaveBeenCalledWith('/saved', expect.any(Array))
  })

  it('main window: no persisted root means no scan', async () => {
    vaultBoot.loadPersistedRoot.mockReturnValue(null)

    renderHook(() => useVaultBoot())
    await flush()

    expect(scan.scanVaultWithSettings).not.toHaveBeenCalled()
    expect(vaultActions.openRoot).not.toHaveBeenCalled()
  })

  it('main window: closeVault on scan failure', async () => {
    vaultBoot.loadPersistedRoot.mockReturnValue('/saved')
    scan.scanVaultWithSettings.mockRejectedValueOnce(new Error('boom'))

    renderHook(() => useVaultBoot())
    await flush()

    expect(vaultActions.closeVault).toHaveBeenCalledTimes(1)
  })
})
