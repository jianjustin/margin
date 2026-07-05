// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const readAssetDataUrl = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`
}))
vi.mock('@/lib/api', () => ({
  api: { readAssetDataUrl: (path: string) => readAssetDataUrl(path) }
}))

import {
  ImageWidget,
  IMAGE_RETRY_DEBOUNCE_MS,
  __resetImageWidgetCachesForTests
} from '@/editor/livePreview/widgets'

const view = { requestMeasure: vi.fn() } as never

function mountWidget(src: string, resolved: string, lineKey?: string): HTMLImageElement {
  const w = new ImageWidget(src, '', resolved, undefined, undefined, lineKey)
  const dom = w.toDOM(view)
  document.body.appendChild(dom)
  return dom.querySelector('img')!
}

describe('ImageWidget — 编辑期 last-good + debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetImageWidgetCachesForTests()
    readAssetDataUrl.mockRejectedValue(new Error('nope'))
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.textContent = ''
  })

  it('有 last-good 时先显示旧图，debounce 后才尝试新 URL', () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load')) // a.png 成功 → 记为 last-good

    const img2 = mountWidget('a.pn', '/v/a.pn', 'doc.md:3') // 编辑中的新 widget
    expect(img2.src).toContain(encodeURIComponent('/v/a.png')) // 立即显示旧图
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    expect(img2.src).toContain(encodeURIComponent('/v/a.pn')) // 到点尝试新 URL
  })

  it('新 URL 最终失败：回退显示 last-good，而非错误占位', async () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load'))

    const img2 = mountWidget('bad.png', '/v/bad.png', 'doc.md:3')
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    img2.dispatchEvent(new Event('error')) // 新 URL 加载失败 → 走回退链
    await Promise.resolve()
    await Promise.resolve() // readAssetDataUrl reject 落定

    expect(img2.src).toContain(encodeURIComponent('/v/a.png'))
    expect(img2.parentElement!.querySelector('.cm-image-error')).toBeNull()
  })

  it('无 lineKey：立即加载，最终失败仍显示错误占位（旧行为）', async () => {
    const img = mountWidget('bad.png', '/v/bad.png')
    expect(img.src).toContain(encodeURIComponent('/v/bad.png')) // 无 debounce
    img.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('.cm-image-error')).not.toBeNull()
  })

  it('widget 销毁后 debounce 定时器不触发加载', () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load'))
    const img2 = mountWidget('a.pn', '/v/a.pn', 'doc.md:3')
    img2.closest('.cm-image-wrap')!.remove() // CM 销毁旧 widget
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    expect(img2.src).toContain(encodeURIComponent('/v/a.png')) // 仍是旧图，没有发起新加载
  })

  it('回退链拿到 data URL 后 load：不登记进 lastGoodByKey，新 widget 直接试新目标', async () => {
    // 让 readAssetDataUrl 返回 data URL（本地回退链成功）
    readAssetDataUrl.mockResolvedValueOnce('data:image/png;base64,AAAA')

    // Step 1: 第一个 widget 的原始 URL 触发 error → 走本地回退链 → 得到 data URL → 触发 load
    const img1 = mountWidget('bad.png', '/v/bad.png', 'doc.md:5')
    // 触发 error 使回退链进入 readAssetDataUrl
    img1.dispatchEvent(new Event('error'))
    // 等待 readAssetDataUrl 的微任务 resolve
    await Promise.resolve()
    await Promise.resolve()
    // 此时 img1.src 应变为 data URL，再触发 load 事件
    img1.dispatchEvent(new Event('load'))

    // Step 2: 创建同 lineKey 的新 widget（新目标 URL）
    const img2 = mountWidget('new.png', '/v/new.png', 'doc.md:5')

    // 断言：img2 不应该把 data URL 当 last-good 来 debounce 显示
    // 如果 data URL 被登记，img2 会先显示 data URL（debounce 分支）
    // 正确行为：img2 直接显示目标 URL（无 debounce 分支），因为 lastGoodByKey 不含 data URL
    expect(img2.src).not.toMatch(/^data:/)
    expect(img2.src).toContain(encodeURIComponent('/v/new.png'))
  })
})
