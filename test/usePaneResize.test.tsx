// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePaneResize } from '@/hooks/usePaneResize'
import { LEFT_PANE } from '@/lib/layout'
import type { PointerEvent as ReactPointerEvent } from 'react'

function pointerDown(clientX: number): ReactPointerEvent {
  return {
    clientX,
    preventDefault: vi.fn()
  } as unknown as ReactPointerEvent
}

function dispatch(type: 'pointermove' | 'pointerup', clientX: number): void {
  const ev = new Event(type) as PointerEvent & Event
  Object.defineProperty(ev, 'clientX', { value: clientX })
  window.dispatchEvent(ev)
}

beforeEach(() => {
  localStorage.clear()
  document.body.style.userSelect = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePaneResize', () => {
  it('live-updates width while dragging (direction 1) and persists on release', () => {
    const { result } = renderHook(() => usePaneResize())
    const setWidth = vi.fn()
    const down = pointerDown(100)

    result.current(down, LEFT_PANE, 262, setWidth, 1)
    expect(down.preventDefault).toHaveBeenCalled()
    expect(document.body.style.userSelect).toBe('none')

    // Drag right by 30px → width grows by 30.
    dispatch('pointermove', 130)
    expect(setWidth).toHaveBeenLastCalledWith(292)

    // Release at +40px → persists 302 and restores user-select.
    dispatch('pointerup', 140)
    expect(setWidth).toHaveBeenLastCalledWith(302)
    expect(localStorage.getItem(LEFT_PANE.storageKey)).toBe('302')
    expect(document.body.style.userSelect).toBe('')
  })

  it('inverts the delta for direction -1 (right-hand pane)', () => {
    const { result } = renderHook(() => usePaneResize())
    const setWidth = vi.fn()

    result.current(pointerDown(200), LEFT_PANE, 300, setWidth, -1)
    // Drag right by 50px → width shrinks by 50 for an inverted pane.
    dispatch('pointermove', 250)
    expect(setWidth).toHaveBeenLastCalledWith(250)
    dispatch('pointerup', 250)
  })

  it('stops listening after release', () => {
    const { result } = renderHook(() => usePaneResize())
    const setWidth = vi.fn()

    result.current(pointerDown(100), LEFT_PANE, 262, setWidth, 1)
    dispatch('pointerup', 100)
    setWidth.mockClear()

    // A stray move after release must not update width.
    dispatch('pointermove', 400)
    expect(setWidth).not.toHaveBeenCalled()
  })
})
