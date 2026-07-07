// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Helpers to configure what the mocked @tauri-apps/api/webview module returns.
// ---------------------------------------------------------------------------

const mockUnlisten = vi.fn()
const mockOnDragDropEvent = vi.fn()

// We use vi.hoisted so that the mock factory can reference these variables
// even though vi.mock is hoisted to the top of the module.
const tauriMock = vi.hoisted(() => {
  const onDragDropEvent = vi.fn()
  return { onDragDropEvent }
})

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: tauriMock.onDragDropEvent
  })
}))

// Import the hook AFTER the mock is set up.
import { useTauriFileDrop } from '@/hooks/useTauriFileDrop'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTauriFileDrop', () => {
  it('registers an onDragDropEvent listener on mount', async () => {
    const onDropPaths = vi.fn()
    const unlisten = vi.fn()
    tauriMock.onDragDropEvent.mockResolvedValue(unlisten)

    renderHook(() => useTauriFileDrop(onDropPaths))

    // Wait for the async register() to complete.
    await vi.waitFor(() => expect(tauriMock.onDragDropEvent).toHaveBeenCalledTimes(1))
  })

  it('calls onDropPaths when a drop event fires', async () => {
    const onDropPaths = vi.fn()
    const unlisten = vi.fn()
    let capturedHandler: ((event: unknown) => void) | null = null

    tauriMock.onDragDropEvent.mockImplementation(
      (handler: (event: unknown) => void) => {
        capturedHandler = handler
        return Promise.resolve(unlisten)
      }
    )

    renderHook(() => useTauriFileDrop(onDropPaths))
    await vi.waitFor(() => expect(capturedHandler).not.toBeNull())

    capturedHandler!({
      payload: { type: 'drop', paths: ['/home/user/image.png'], position: { x: 100, y: 200 } }
    })

    expect(onDropPaths).toHaveBeenCalledWith(['/home/user/image.png'], { x: 100, y: 200 })
  })

  it('does not call onDropPaths for non-drop events', async () => {
    const onDropPaths = vi.fn()
    let capturedHandler: ((event: unknown) => void) | null = null

    tauriMock.onDragDropEvent.mockImplementation(
      (handler: (event: unknown) => void) => {
        capturedHandler = handler
        return Promise.resolve(vi.fn())
      }
    )

    renderHook(() => useTauriFileDrop(onDropPaths))
    await vi.waitFor(() => expect(capturedHandler).not.toBeNull())

    capturedHandler!({ payload: { type: 'hover', paths: [], position: { x: 0, y: 0 } } })

    expect(onDropPaths).not.toHaveBeenCalled()
  })

  it('calls the unlisten function on unmount', async () => {
    const onDropPaths = vi.fn()
    const unlisten = vi.fn()
    tauriMock.onDragDropEvent.mockResolvedValue(unlisten)

    const { unmount } = renderHook(() => useTauriFileDrop(onDropPaths))
    await vi.waitFor(() => expect(tauriMock.onDragDropEvent).toHaveBeenCalledTimes(1))

    unmount()

    // Allow micro-tasks to flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when getCurrentWebview throws (non-Tauri environment)', async () => {
    const onDropPaths = vi.fn()
    tauriMock.onDragDropEvent.mockImplementation(() => {
      throw new Error('Not in a Tauri environment')
    })

    // Should not throw.
    const { unmount } = renderHook(() => useTauriFileDrop(onDropPaths))
    await new Promise((r) => setTimeout(r, 0))

    expect(onDropPaths).not.toHaveBeenCalled()
    unmount()
  })
})
