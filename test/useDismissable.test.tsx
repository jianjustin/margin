// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { useDismissable } from '@/hooks/useDismissable'

function HarnessWithRef(): JSX.Element {
  const onClose = vi.fn()
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(onClose, ref)
  return (
    <div>
      <div ref={ref} data-testid="dismissable-container">
        Inside container
      </div>
      <div data-testid="outside-container">Outside container</div>
    </div>
  )
}

function HarnessWithoutRef(): JSX.Element {
  const onClose = vi.fn()
  useDismissable(onClose)
  return (
    <div>
      <div data-testid="container">Container</div>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('useDismissable', () => {
  it('triggers onClose on Escape keydown', () => {
    const onClose = vi.fn()
    function Harness(): JSX.Element {
      useDismissable(onClose)
      return <div>Test</div>
    }
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not trigger onClose on other keys', () => {
    const onClose = vi.fn()
    function Harness(): JSX.Element {
      useDismissable(onClose)
      return <div>Test</div>
    }
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('triggers onClose on outside mousedown when ref is provided', () => {
    const onClose = vi.fn()
    function Harness(): JSX.Element {
      const ref = useRef<HTMLDivElement>(null)
      useDismissable(onClose, ref)
      return (
        <div>
          <div ref={ref} data-testid="dismissable-container">
            Inside container
          </div>
          <div data-testid="outside-container">Outside container</div>
        </div>
      )
    }
    const { getByTestId } = render(<Harness />)
    const outsideElement = getByTestId('outside-container')
    fireEvent.mouseDown(outsideElement)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not trigger onClose on inside mousedown when ref is provided', () => {
    const onClose = vi.fn()
    function Harness(): JSX.Element {
      const ref = useRef<HTMLDivElement>(null)
      useDismissable(onClose, ref)
      return (
        <div>
          <div ref={ref} data-testid="dismissable-container">
            Inside container
          </div>
        </div>
      )
    }
    const { getByTestId } = render(<Harness />)
    const insideElement = getByTestId('dismissable-container')
    fireEvent.mouseDown(insideElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not register mousedown listener when ref is not provided', () => {
    const onClose = vi.fn()
    function Harness(): JSX.Element {
      useDismissable(onClose)
      return (
        <div>
          <div data-testid="container">Container</div>
        </div>
      )
    }
    const { getByTestId } = render(<Harness />)
    const container = getByTestId('container')
    fireEvent.mouseDown(container)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops propagation when Escape is pressed', () => {
    const onClose = vi.fn()
    const propagationStopper = vi.fn()
    function Harness(): JSX.Element {
      useDismissable(onClose)
      return <div>Test</div>
    }
    render(<Harness />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    vi.spyOn(event, 'stopPropagation')
    window.addEventListener('keydown', propagationStopper)
    window.dispatchEvent(event)
    expect(onClose).toHaveBeenCalled()
  })
})
