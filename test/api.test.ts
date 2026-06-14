import { describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args)
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn()
}))

import { api } from '@/lib/api'

describe('api command arguments', () => {
  it('uses Tauri camelCase argument keys for multi-word command params', async () => {
    invoke.mockResolvedValue(undefined)

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
})
