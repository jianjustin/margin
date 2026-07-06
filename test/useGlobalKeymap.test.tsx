// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useGlobalKeymap } from '@/hooks/useGlobalKeymap'

const uiActions = vi.hoisted(() => ({
  toggleSidebar: vi.fn(),
  toggleDrawer: vi.fn(),
  toggleSettings: vi.fn(),
  toggleSearch: vi.fn()
}))

const windowManager = vi.hoisted(() => ({
  createPeerWindow: vi.fn()
}))

vi.mock('@/stores/uiStore', () => ({
  useUiStore: { getState: () => uiActions }
}))

vi.mock('@/lib/windowManager', () => ({
  createPeerWindow: windowManager.createPeerWindow
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function press(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(window, { key, metaKey: true, ...opts })
}

describe('useGlobalKeymap', () => {
  it('⌘B toggles the sidebar', () => {
    renderHook(() => useGlobalKeymap())
    press('b')
    expect(uiActions.toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('⌘\\ toggles the outline drawer', () => {
    renderHook(() => useGlobalKeymap())
    press('\\')
    expect(uiActions.toggleDrawer).toHaveBeenCalledTimes(1)
  })

  it('⌘, opens settings', () => {
    renderHook(() => useGlobalKeymap())
    press(',')
    expect(uiActions.toggleSettings).toHaveBeenCalledTimes(1)
  })

  it('⌘K opens search', () => {
    renderHook(() => useGlobalKeymap())
    press('k')
    expect(uiActions.toggleSearch).toHaveBeenCalledTimes(1)
  })

  it('⌘⇧N opens a new (peer) window, not a new note', () => {
    renderHook(() => useGlobalKeymap())
    press('N', { shiftKey: true })
    expect(windowManager.createPeerWindow).toHaveBeenCalledTimes(1)
  })

  it('also matches ctrlKey (non-mac) for the same combos', () => {
    renderHook(() => useGlobalKeymap())
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(uiActions.toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('preventDefault is called for a matched combo', () => {
    renderHook(() => useGlobalKeymap())
    const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true })
    const spy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not fire any action for an unmatched key/modifier combo', () => {
    renderHook(() => useGlobalKeymap())
    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    fireEvent.keyDown(window, { key: 'b' }) // no modifier
    expect(uiActions.toggleSidebar).not.toHaveBeenCalled()
    expect(uiActions.toggleDrawer).not.toHaveBeenCalled()
    expect(uiActions.toggleSettings).not.toHaveBeenCalled()
    expect(uiActions.toggleSearch).not.toHaveBeenCalled()
    expect(windowManager.createPeerWindow).not.toHaveBeenCalled()
  })

  it('removes the keydown listener on unmount', () => {
    const { unmount } = renderHook(() => useGlobalKeymap())
    unmount()
    press('b')
    expect(uiActions.toggleSidebar).not.toHaveBeenCalled()
  })
})
