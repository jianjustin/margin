// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/ui/Modal'
import { Popover } from '@/components/ui/Popover'

afterEach(cleanup)

describe('Modal', () => {
  it('open=false 时不渲染任何内容', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <div data-testid="content">内容</div>
      </Modal>
    )
    expect(container.querySelector('[data-testid="content"]')).toBeNull()
  })

  it('open=true 时渲染子内容', () => {
    const { getByTestId } = render(
      <Modal open={true} onClose={() => {}}>
        <div data-testid="content">内容</div>
      </Modal>
    )
    expect(getByTestId('content')).toBeTruthy()
  })

  it('按 Esc 调用 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose}>
        <div>内容</div>
      </Modal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('点击遮罩调用 onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        <div data-testid="card">内容</div>
      </Modal>
    )
    // 遮罩是最外层 fixed div
    const backdrop = container.querySelector('.fixed.inset-0')!
    fireEvent.mouseDown(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('点击卡片内部不调用 onClose', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(
      <Modal open={true} onClose={onClose}>
        <div data-testid="inner">内容</div>
      </Modal>
    )
    fireEvent.mouseDown(getByTestId('inner'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('传入 width 时内层卡片应用 style.width', () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} width={480}>
        <div>内容</div>
      </Modal>
    )
    // 内层卡片是遮罩的直接子元素
    const backdrop = container.querySelector('.fixed.inset-0')!
    const card = backdrop.firstElementChild as HTMLElement
    expect(card.style.width).toBe('480px')
  })

  it('open=false 时按 Esc 不应调用 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open={false} onClose={onClose}>
        <div>内容</div>
      </Modal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('align=top 时容器应包含 items-start 和 pt-[15vh]', () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} align="top">
        <div>内容</div>
      </Modal>
    )
    const backdrop = container.querySelector('.fixed.inset-0')!
    expect(backdrop.className).toContain('items-start')
    expect(backdrop.className).toContain('pt-[15vh]')
  })

  it('align=center（默认）时容器应包含 items-center', () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}}>
        <div>内容</div>
      </Modal>
    )
    const backdrop = container.querySelector('.fixed.inset-0')!
    expect(backdrop.className).toContain('items-center')
  })
})

describe('Popover', () => {
  it('渲染子内容', () => {
    const { getByTestId } = render(
      <Popover anchor={{ x: 100, y: 200 }} onClose={() => {}}>
        <div data-testid="pop-content">弹出内容</div>
      </Popover>
    )
    expect(getByTestId('pop-content')).toBeTruthy()
  })

  it('按 Esc 调用 onClose', () => {
    const onClose = vi.fn()
    render(
      <Popover anchor={{ x: 100, y: 200 }} onClose={onClose}>
        <div>内容</div>
      </Popover>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('点击 Popover 内部不调用 onClose', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(
      <Popover anchor={{ x: 100, y: 200 }} onClose={onClose}>
        <div data-testid="pop-inner">内容</div>
      </Popover>
    )
    fireEvent.mouseDown(getByTestId('pop-inner'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('点击 Popover 外部调用 onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <div>
        <Popover anchor={{ x: 100, y: 200 }} onClose={onClose}>
          <div data-testid="pop-inner">内容</div>
        </Popover>
        <div data-testid="outside">外部</div>
      </div>
    )
    fireEvent.mouseDown(container.querySelector('[data-testid="outside"]')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('anchor 坐标应用为 left/top style', () => {
    const { container } = render(
      <Popover anchor={{ x: 150, y: 250 }} onClose={() => {}}>
        <div>内容</div>
      </Popover>
    )
    const popover = container.querySelector('.fixed') as HTMLElement
    expect(popover.style.left).toBe('150px')
    expect(popover.style.top).toBe('250px')
  })

  it('视口 clamp：anchor 超出右缘时 left 被钳制', () => {
    // mock innerWidth=800, getBoundingClientRect width=200
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    const origGetBCR = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => {} } as DOMRect
    }

    // anchor.x=700 → 700+200=900 > 800 → clamp to 800-200-8=592
    const { container } = render(
      <Popover anchor={{ x: 700, y: 100 }} onClose={() => {}}>
        <div>内容</div>
      </Popover>
    )
    const popover = container.querySelector('.fixed') as HTMLElement
    expect(parseFloat(popover.style.left)).toBeLessThanOrEqual(592)

    HTMLElement.prototype.getBoundingClientRect = origGetBCR
  })

  it('视口 clamp：anchor 未超出右缘时保留原始 left', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    const origGetBCR = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => {} } as DOMRect
    }

    // anchor.x=100 → 100+100=200 < 800 → 不 clamp，保持 100
    const { container } = render(
      <Popover anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <div>内容</div>
      </Popover>
    )
    const popover = container.querySelector('.fixed') as HTMLElement
    expect(parseFloat(popover.style.left)).toBe(100)

    HTMLElement.prototype.getBoundingClientRect = origGetBCR
  })

  it('role prop 透传到根元素', () => {
    const { container } = render(
      <Popover anchor={{ x: 10, y: 10 }} onClose={() => {}} role="menu">
        <div>内容</div>
      </Popover>
    )
    const popover = container.querySelector('.fixed')!
    expect(popover.getAttribute('role')).toBe('menu')
  })
})
