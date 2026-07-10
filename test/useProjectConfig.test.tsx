// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, cleanup, waitFor } from '@testing-library/react'

const readProjectConfig = vi.fn()
const writeProjectConfig = vi.fn().mockResolvedValue(undefined)
const emit = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    readProjectConfig: (...a: unknown[]) => readProjectConfig(...a),
    writeProjectConfig: (...a: unknown[]) => writeProjectConfig(...a)
  }
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => emit(...args)
}))

import { useProjectConfig } from '@/hooks/useProjectConfig'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'

function Harness(): null {
  useProjectConfig()
  return null
}

beforeEach(() => {
  readProjectConfig.mockReset().mockResolvedValue(null)
  writeProjectConfig.mockReset().mockResolvedValue(undefined)
  emit.mockReset().mockResolvedValue(undefined)
  useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
  useSettingsStore.setState({
    enabledPlugins: ['builtin.outline', 'builtin.schedule'],
    scheduleDir: '日程',
    hiddenFolders: [],
    assetsDir: 'assets',
    plantUmlServerUrl: 'https://kroki.io',
    diagramFitWidth: true,
    mathEnabled: true
  })
})

afterEach(cleanup)

describe('useProjectConfig', () => {
  it('hydrates settings from a vault config when a vault opens', async () => {
    readProjectConfig.mockResolvedValue(
      JSON.stringify({ enabledPlugins: ['builtin.outline'], scheduleDir: 'Daily', hiddenFolders: ['.claude'] })
    )
    render(<Harness />)
    act(() => {
      useVaultStore.setState({ root: '/v' })
    })
    await waitFor(() => {
      expect(useSettingsStore.getState().scheduleDir).toBe('Daily')
    })
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline'])
    expect(useSettingsStore.getState().hiddenFolders).toEqual(['.claude'])
    expect(writeProjectConfig).not.toHaveBeenCalled()
  })

  it('writes project config when settings change with a vault open', async () => {
    render(<Harness />)
    act(() => {
      useVaultStore.setState({ root: '/v' })
    })
    await waitFor(() => expect(readProjectConfig).toHaveBeenCalled())

    act(() => {
      useSettingsStore.getState().setScheduleDir('Notes')
    })

    await waitFor(() => expect(writeProjectConfig).toHaveBeenCalled())
    const [root, json] = writeProjectConfig.mock.calls.at(-1)!
    expect(root).toBe('/v')
    expect(JSON.parse(json)).toEqual({
      enabledPlugins: ['builtin.outline', 'builtin.schedule'],
      scheduleDir: 'Notes',
      hiddenFolders: [],
      assetsDir: 'assets',
      plantUmlServerUrl: 'https://kroki.io',
      diagramFitWidth: true,
      mathEnabled: true
    })
  })

  it('does not write project config when no vault is open', async () => {
    render(<Harness />)
    act(() => {
      useSettingsStore.getState().setScheduleDir('Notes')
    })
    await Promise.resolve()
    expect(writeProjectConfig).not.toHaveBeenCalled()
  })
})
