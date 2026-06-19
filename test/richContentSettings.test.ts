// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const emit = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => emit(...args)
}))

describe('rich content settings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('sanitizes and persists v2.4 project config fields', async () => {
    const {
      sanitizeProjectConfig,
      projectConfigOf,
      useSettingsStore
    } = await import('@/stores/settingsStore')

    const partial = sanitizeProjectConfig({
      assetsDir: ' images ',
      plantUmlServerUrl: ' https://kroki.example ',
      diagramFitWidth: false,
      mathEnabled: true
    })

    expect(partial).toEqual({
      assetsDir: 'images',
      plantUmlServerUrl: 'https://kroki.example',
      diagramFitWidth: false,
      mathEnabled: true
    })

    useSettingsStore.getState().setAssetsDir('attachments')
    useSettingsStore.getState().setPlantUmlServerUrl('https://kroki.io')
    useSettingsStore.getState().setDiagramFitWidth(false)
    useSettingsStore.getState().setMathEnabled(false)

    expect(projectConfigOf(useSettingsStore.getState())).toMatchObject({
      assetsDir: 'attachments',
      plantUmlServerUrl: 'https://kroki.io',
      diagramFitWidth: false,
      mathEnabled: false
    })
  })
})
