// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { useDismissable } from '@/hooks/useDismissable'

afterEach(cleanup)

/** 测试组件：包装 useDismissable 的 hook，设置 outsideRef */
function WithOutsideRef({
  onClose,
  enabled = true,
}: {
  onClose: () => void
  enabled?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useDismissable(onClose, containerRef, enabled)

  return (
    <div data-testid="container">
      <div ref={containerRef} data-testid="inside">
        内部
      </div>
    </div>
  )
}

/** 测试组件：包装 useDismissable 的 hook，无 outsideRef */
function NoOutsideRef({
  onClose,
  enabled = true,
}: {
  onClose: () => void
  enabled?: boolean
}) {
  useDismissable(onClose, undefined, enabled)
  return <div data-testid="simple">简单测试</div>
}

describe('useDismissable', () => {
  it('enabled=true 时按 Esc 调用 onClose', () => {
    const onClose = vi.fn()
    render(<NoOutsideRef onClose={onClose} enabled={true} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('enabled=false 时按 Esc 不调用 onClose', () => {
    const onClose = vi.fn()
    render(<NoOutsideRef onClose={onClose} enabled={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('enabled=true + outsideRef 时内部 mousedown 不调用 onClose', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(
      <WithOutsideRef onClose={onClose} enabled={true} />
    )
    fireEvent.mouseDown(getByTestId('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('enabled=true + outsideRef 时外部 mousedown 调用 onClose', () => {
    const onClose = vi.fn()
    const { getByTestId, container } = render(
      <div>
        <WithOutsideRef onClose={onClose} enabled={true} />
        <div data-testid="outside">外部</div>
      </div>
    )
    fireEvent.mouseDown(getByTestId('outside'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('enabled=false + outsideRef 时外部 mousedown 不调用 onClose', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(
      <div>
        <WithOutsideRef onClose={onClose} enabled={false} />
        <div data-testid="outside">外部</div>
      </div>
    )
    fireEvent.mouseDown(getByTestId('outside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('非 Escape 键不触发 onClose', () => {
    const onClose = vi.fn()
    render(<NoOutsideRef onClose={onClose} enabled={true} />)
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
