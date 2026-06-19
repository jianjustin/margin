// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const readAssetBytes = vi.fn()
const readAssetDataUrl = vi.fn()
const convertFileSrc = vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`)
const requestMeasure = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => convertFileSrc(path)
}))

vi.mock('@/lib/api', () => ({
  api: {
    readAssetBytes: (path: string) => readAssetBytes(path),
    readAssetDataUrl: (path: string) => readAssetDataUrl(path)
  }
}))

import { ImageWidget } from '@/editor/livePreview/widgets'

describe('ImageWidget local fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readAssetBytes.mockResolvedValue([137, 80, 78, 71])
    readAssetDataUrl.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=')
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('renders a data URL from local bytes when the asset protocol image fails', async () => {
    const widget = new ImageWidget('assets/pic.png', 'Pic', '/Users/me/vault/assets/pic.png')
    const dom = widget.toDOM({ requestMeasure } as never)
    document.body.appendChild(dom)
    const img = dom.querySelector('img')!

    expect(img.src).toBe('asset://localhost/%2FUsers%2Fme%2Fvault%2Fassets%2Fpic.png')

    img.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()

    expect(readAssetDataUrl).toHaveBeenCalledWith('/Users/me/vault/assets/pic.png')
    expect(readAssetBytes).not.toHaveBeenCalled()
    expect(img.src).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(dom.querySelector('.cm-image-error')).toBeNull()
  })
})
