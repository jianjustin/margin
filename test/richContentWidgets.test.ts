// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const renderRemoteDiagram = vi.fn()
const readAssetDataUrl = vi.fn()
const readRemoteDataUrl = vi.fn()
const cacheRemoteMedia = vi.fn()
const convertFileSrc = vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`)
const requestMeasure = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => convertFileSrc(path)
}))

vi.mock('@/lib/api', () => ({
  api: {
    readAssetDataUrl: (path: string) => readAssetDataUrl(path),
    readRemoteDataUrl: (url: string) => readRemoteDataUrl(url),
    cacheRemoteMedia: (url: string) => cacheRemoteMedia(url),
    renderRemoteDiagram: (serverUrl: string, kind: string, code: string) =>
      renderRemoteDiagram(serverUrl, kind, code)
  }
}))

import { CalloutWidget, DiagramWidget, MediaWidget } from '@/editor/livePreview/widgets'

describe('rich content widgets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderRemoteDiagram.mockResolvedValue('<svg><text>ok</text></svg>')
    readRemoteDataUrl.mockResolvedValue('data:video/mp4;base64,AAAA')
    cacheRemoteMedia.mockResolvedValue('/Users/me/Library/Caches/Margin/remote-media/demo.mp4')
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('lets folded callouts expand in preview', () => {
    const dom = new CalloutWidget('tip', '折叠提示', '可展开内容', true).toDOM()
    document.body.appendChild(dom)

    expect(dom.querySelector('.cm-callout-body')).toBeNull()
    dom.querySelector<HTMLElement>('.cm-callout-title')!.click()

    expect(dom.querySelector('.cm-callout-body')?.textContent).toContain('可展开内容')
    expect(dom.querySelector('.cm-callout-marker')?.textContent).toBe('!')
  })

  it('lets native media controls receive pointer events', () => {
    const widget = new MediaWidget('demo.mp4', 'video', 'https://example.test/demo.mp4')
    expect(widget.ignoreEvent()).toBe(true)
  })

  it('falls back to a cached local asset URL when remote media fails to load', async () => {
    const dom = new MediaWidget('demo.mp4', 'video', 'https://example.test/demo.mp4').toDOM()
    document.body.appendChild(dom)
    const video = dom.querySelector('video')!
    const source = video.querySelector('source')!

    expect(source.src).toBe('https://example.test/demo.mp4')
    expect(source.type).toBe('video/mp4')

    video.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()

    expect(cacheRemoteMedia).toHaveBeenCalledWith('https://example.test/demo.mp4')
    expect(source.src).toBe(
      'asset://localhost/%2FUsers%2Fme%2FLibrary%2FCaches%2FMargin%2Fremote-media%2Fdemo.mp4'
    )
    expect(source.type).toBe('video/mp4')
    expect(dom.textContent).toContain('已缓存远程媒体')
  })

  it('falls back to a remote data URL if the cached media URL still fails', async () => {
    const dom = new MediaWidget('demo.mp4', 'video', 'https://example.test/demo.mp4').toDOM()
    document.body.appendChild(dom)
    const video = dom.querySelector('video')!
    const source = video.querySelector('source')!

    video.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()

    video.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()

    expect(readRemoteDataUrl).toHaveBeenCalledWith('https://example.test/demo.mp4')
    expect(source.src).toBe('data:video/mp4;base64,AAAA')
    expect(source.type).toBe('video/mp4')
    expect(dom.textContent).toContain('已切换到内存媒体')
  })

  it('shows a readable media error when all remote fallbacks fail', async () => {
    cacheRemoteMedia.mockRejectedValueOnce(new Error('cache failed'))
    readRemoteDataUrl.mockRejectedValueOnce(new Error('data failed'))
    const dom = new MediaWidget('demo.mp3', 'audio', 'https://example.test/demo.mp3').toDOM()
    document.body.appendChild(dom)
    const audio = dom.querySelector('audio')!

    audio.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(dom.textContent).toContain('媒体加载失败')
    expect(dom.textContent).toContain('data failed')
  })

  it('renders remote diagrams through the native API bridge', async () => {
    const dom = new DiagramWidget('@startuml\n@enduml', 'plantuml', 'https://kroki.io', true).toDOM({
      requestMeasure
    } as never)
    document.body.appendChild(dom)

    await Promise.resolve()
    await Promise.resolve()

    expect(renderRemoteDiagram).toHaveBeenCalledWith('https://kroki.io', 'plantuml', '@startuml\n@enduml')
    expect(dom.innerHTML).toContain('<svg')
    expect(dom.textContent).toContain('ok')
  })
})
