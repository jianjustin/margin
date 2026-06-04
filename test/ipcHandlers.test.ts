import { describe, it, expect, vi } from 'vitest'
import { registerIpcHandlers, type IpcHandlerDeps } from '../src/main/ipcHandlers'
import { IPC } from '../src/shared/ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function makeFakeIpcMain(): {
  handle: (channel: string, fn: Handler) => void
  handlers: Map<string, Handler>
} {
  const handlers = new Map<string, Handler>()
  return {
    handle: (channel, fn) => {
      handlers.set(channel, fn)
    },
    handlers
  }
}

function makeStubDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  return {
    dialogOpenFile: vi.fn().mockResolvedValue(null),
    dialogOpenFolder: vi.fn().mockResolvedValue(null),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    scanVault: vi.fn().mockReturnValue([]),
    createNote: vi.fn().mockResolvedValue(''),
    createFolder: vi.fn().mockResolvedValue(''),
    renamePath: vi.fn().mockResolvedValue(''),
    trashPath: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('registerIpcHandlers', () => {
  it('registers all 9 channels including the four CRUD ones', () => {
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps())

    expect(fake.handlers.has(IPC.dialogOpenFile)).toBe(true)
    expect(fake.handlers.has(IPC.dialogOpenFolder)).toBe(true)
    expect(fake.handlers.has(IPC.fileRead)).toBe(true)
    expect(fake.handlers.has(IPC.fileWrite)).toBe(true)
    expect(fake.handlers.has(IPC.vaultScan)).toBe(true)
    expect(fake.handlers.has(IPC.fileCreate)).toBe(true)
    expect(fake.handlers.has(IPC.folderCreate)).toBe(true)
    expect(fake.handlers.has(IPC.pathRename)).toBe(true)
    expect(fake.handlers.has(IPC.pathTrash)).toBe(true)
  })

  it('forwards file:create to createNote(dir, name) and returns its result', async () => {
    const createNote = vi.fn().mockResolvedValue('/vault/folder/new.md')
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps({ createNote }))

    const handler = fake.handlers.get(IPC.fileCreate)!
    const result = await handler({}, '/vault/folder', 'new.md')

    expect(createNote).toHaveBeenCalledWith('/vault/folder', 'new.md')
    expect(result).toBe('/vault/folder/new.md')
  })

  it('forwards folder:create to createFolder(dir, name)', async () => {
    const createFolder = vi.fn().mockResolvedValue('/vault/sub')
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps({ createFolder }))

    const handler = fake.handlers.get(IPC.folderCreate)!
    const result = await handler({}, '/vault', 'sub')

    expect(createFolder).toHaveBeenCalledWith('/vault', 'sub')
    expect(result).toBe('/vault/sub')
  })

  it('forwards path:rename to renamePath(oldPath, newName)', async () => {
    const renamePath = vi.fn().mockResolvedValue('/vault/renamed.md')
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps({ renamePath }))

    const handler = fake.handlers.get(IPC.pathRename)!
    const result = await handler({}, '/vault/old.md', 'renamed.md')

    expect(renamePath).toHaveBeenCalledWith('/vault/old.md', 'renamed.md')
    expect(result).toBe('/vault/renamed.md')
  })

  it('forwards path:trash to trashPath(path)', async () => {
    const trashPath = vi.fn().mockResolvedValue(undefined)
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps({ trashPath }))

    const handler = fake.handlers.get(IPC.pathTrash)!
    await handler({}, '/vault/old.md')

    expect(trashPath).toHaveBeenCalledWith('/vault/old.md')
  })

  it('forwards vault:scan passing the event through to scanVault', () => {
    const scanVault = vi.fn().mockReturnValue([{ name: 'a.md', path: '/v/a.md', type: 'file' }])
    const fake = makeFakeIpcMain()
    registerIpcHandlers(fake, makeStubDeps({ scanVault }))

    const handler = fake.handlers.get(IPC.vaultScan)!
    const event = { sender: 'fake' }
    const result = handler(event, '/v')

    expect(scanVault).toHaveBeenCalledWith(event, '/v')
    expect(result).toEqual([{ name: 'a.md', path: '/v/a.md', type: 'file' }])
  })
})
