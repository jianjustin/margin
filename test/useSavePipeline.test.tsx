// @vitest-environment jsdom
/**
 * Unit tests for useSavePipeline.
 * All timer-dependent tests use vi fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentStore } from '@/stores/documentStore'
import { resetPathMutationGuards, beginPathMutation, endPathMutation } from '@/lib/pathMutationGuards'

// ---------------------------------------------------------------------------
// Mock saveDocument so no Tauri IPC is needed.
// ---------------------------------------------------------------------------
const saveDocumentMock = vi.hoisted(() => vi.fn())
const waitForDocumentSavesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/saveDocument', () => ({
  saveDocument: saveDocumentMock,
  waitForDocumentSave: vi.fn(() => Promise.resolve()),
  waitForDocumentSaves: waitForDocumentSavesMock
}))

vi.mock('@/lib/api', () => ({
  api: {
    writeFile: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve(''))
  }
}))

// Import AFTER mocks are registered
import { useSavePipeline } from '@/hooks/useSavePipeline'

function resetStore(): void {
  useDocumentStore.getState().reset()
  resetPathMutationGuards()
}

function openDirtyTab(path: string, savedContent = 'saved', dirtyContent = 'dirty'): void {
  const store = useDocumentStore.getState()
  store.openOrActivate(path, savedContent)
  store.setActiveContent(dirtyContent)
}

describe('useSavePipeline', () => {
  beforeEach(() => {
    resetStore()
    vi.useFakeTimers()
    saveDocumentMock.mockReset()
    saveDocumentMock.mockResolvedValue(undefined)
    waitForDocumentSavesMock.mockReset()
    waitForDocumentSavesMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetStore()
  })

  // ── 1. scheduleSave 800ms 防抖合并 ─────────────────────────────────────

  it('does not save immediately on scheduleSave', () => {
    openDirtyTab('/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/a.md')
    })

    expect(saveDocumentMock).not.toHaveBeenCalled()
  })

  it('saves after 800ms debounce', () => {
    openDirtyTab('/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/a.md')
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).toHaveBeenCalledTimes(1)
    expect(saveDocumentMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/a.md'
    )
  })

  it('two scheduleSave calls for same path within 800ms coalesce to one save', () => {
    openDirtyTab('/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/a.md')
      vi.advanceTimersByTime(400)
      result.current.scheduleSave('/a.md')
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).toHaveBeenCalledTimes(1)
  })

  it('does not fire save for clean tabs after debounce', () => {
    useDocumentStore.getState().openOrActivate('/clean.md', 'content')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/clean.md')
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).not.toHaveBeenCalled()
  })

  // ── 2. flushSaves 立即落盘并清 timer ────────────────────────────────────

  it('flushSaves immediately calls saveDocument and cancels pending debounce', async () => {
    openDirtyTab('/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/a.md')
    })

    await act(async () => {
      await result.current.flushSaves()
    })

    expect(saveDocumentMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/a.md'
    )

    // After flush, advancing timer should NOT cause an additional save
    saveDocumentMock.mockClear()
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(saveDocumentMock).not.toHaveBeenCalled()
  })

  it('flushSaves resolves after all in-flight saves complete', async () => {
    openDirtyTab('/a.md')

    let resolveWrite!: () => void
    saveDocumentMock.mockImplementation(
      () => new Promise<void>((r) => { resolveWrite = r })
    )

    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/a.md')
    })

    let flushed = false
    const flushPromise = result.current.flushSaves().then(() => { flushed = true })

    // Not yet resolved – write hasn't finished
    await Promise.resolve()
    expect(flushed).toBe(false)

    // Resolve the underlying write
    resolveWrite()
    await flushPromise
    expect(flushed).toBe(true)
  })

  // ── 3. pauseForPaths 后到时不落盘 ────────────────────────────────────────

  it('pauseForPaths prevents save for affected path when timer fires', () => {
    openDirtyTab('/docs/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/docs/a.md')
      result.current.pauseForPaths(['/docs/a.md'])
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/docs/a.md'
    )
  })

  it('pauseForPaths keeps saving unaffected paths', () => {
    openDirtyTab('/docs/a.md')
    openDirtyTab('/other/b.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/docs/a.md')
      result.current.scheduleSave('/other/b.md')
      result.current.pauseForPaths(['/docs/a.md'])
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/docs/a.md'
    )
    expect(saveDocumentMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/other/b.md'
    )
  })

  // ── 4. resumeAfterMutation(old, new) 后以新路径落盘 ─────────────────────

  it('resumeAfterMutation with newPath reschedules save with new path', () => {
    openDirtyTab('/docs/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/docs/a.md')
      result.current.pauseForPaths(['/docs/a.md'])
    })

    // Simulate path rename: tab in store now has new path
    useDocumentStore.getState().replacePath('/docs/a.md', '/docs/renamed.md')

    act(() => {
      result.current.resumeAfterMutation('/docs/a.md', '/docs/renamed.md')
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/docs/renamed.md'
    )
    expect(saveDocumentMock).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/docs/a.md'
    )
  })

  // ── 5. resumeAfterMutation(old, null)（trash 场景）丢弃暂停的保存 ────────

  it('resumeAfterMutation with null discards the paused save', () => {
    openDirtyTab('/docs/a.md')
    const { result } = renderHook(() => useSavePipeline())

    act(() => {
      result.current.scheduleSave('/docs/a.md')
      result.current.pauseForPaths(['/docs/a.md'])
      result.current.resumeAfterMutation('/docs/a.md', null)
      vi.advanceTimersByTime(800)
    })

    expect(saveDocumentMock).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      '/docs/a.md'
    )
  })

  // ── 6. waitForDocumentSaves 等待在途保存完成 ──────────────────────────────

  it('waitForDocumentSaves resolves when all paths have no in-flight saves', async () => {
    const { result } = renderHook(() => useSavePipeline())

    await act(async () => {
      await result.current.waitForDocumentSaves(['/a.md', '/b.md'])
    })
    expect(waitForDocumentSavesMock).toHaveBeenCalledWith(['/a.md', '/b.md'])
  })

  it('waitForDocumentSaves waits until the lib promise resolves', async () => {
    let resolveWait!: () => void
    waitForDocumentSavesMock.mockImplementation(
      () => new Promise<void>((r) => { resolveWait = r })
    )

    const { result } = renderHook(() => useSavePipeline())

    let resolved = false
    const p = result.current.waitForDocumentSaves(['/a.md']).then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveWait()
    await p
    expect(resolved).toBe(true)
  })

  // ── 7. Guard interaction: paths blocked by active guard are not saved ───

  it('scheduleSave while a pathMutationGuard is active does not immediately schedule a timer', () => {
    openDirtyTab('/project/a.md')
    const { result } = renderHook(() => useSavePipeline())

    const guard = beginPathMutation('/project')

    act(() => {
      result.current.scheduleSave('/project/a.md')
      vi.advanceTimersByTime(800)
    })

    // While guard is active, the path should be blocked and no save fires.
    expect(saveDocumentMock).not.toHaveBeenCalled()

    // Clean up guard.
    endPathMutation(guard)
  })
})
