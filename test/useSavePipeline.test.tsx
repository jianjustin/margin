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

  // ── 8. IPC 失败补偿路径（rename/move 失败，原地恢复） ─────────────────────

  describe('IPC failure compensation — old==new identity remap (rename/move failure)', () => {
    it('saves to old path after failure compensation sequence', () => {
      // ① 文档 dirty，scheduleSave 排队
      openDirtyTab('/docs/a.md')
      const { result } = renderHook(() => useSavePipeline())

      act(() => {
        result.current.scheduleSave('/docs/a.md')
      })

      // ② pauseForPaths([oldPath]) — 模拟 IPC 前挂起
      act(() => {
        result.current.pauseForPaths(['/docs/a.md'])
      })

      // 确认挂起后 timer 不落盘
      act(() => {
        vi.advanceTimersByTime(800)
      })
      expect(saveDocumentMock).not.toHaveBeenCalled()

      // ③ 模拟 IPC reject 后的补偿调用：resumeAfterMutation(old, old)（old==new）
      act(() => {
        result.current.resumeAfterMutation('/docs/a.md', '/docs/a.md')
      })

      // ④ 推进 timer，落盘应发生在旧路径
      act(() => {
        vi.advanceTimersByTime(800)
      })

      expect(saveDocumentMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        '/docs/a.md'
      )
      // 不应落盘到任何其他路径
      expect(saveDocumentMock).toHaveBeenCalledTimes(1)
    })

    it('blocked paths are re-scheduled and saved after failure compensation', () => {
      // ① 主路径 + 旁路径都 dirty
      openDirtyTab('/docs/a.md')
      openDirtyTab('/docs/b.md')

      const { result } = renderHook(() => useSavePipeline())

      // 开启 guard，使 /docs 下路径先被 block
      const guard = beginPathMutation('/docs')

      // /docs/b.md 在 guard 活跃期间 scheduleSave → 进入 blockedPaths
      act(() => {
        result.current.scheduleSave('/docs/a.md')
        result.current.scheduleSave('/docs/b.md')
      })

      // /docs/a.md 排队但随即被 pause（模拟 IPC 前挂起）
      act(() => {
        result.current.pauseForPaths(['/docs/a.md'])
      })

      endPathMutation(guard)

      // 模拟 IPC reject 后：① resumeAfterMutation(old, old) ② blockedPaths 补偿
      act(() => {
        result.current.resumeAfterMutation('/docs/a.md', '/docs/a.md')
        // blockedPaths 由 App 层显式回调；此处直接调用 scheduleSave 模拟
        guard.blockedPaths.forEach((p) => result.current.scheduleSave(p))
      })

      act(() => {
        vi.advanceTimersByTime(800)
      })

      // /docs/a.md 和 /docs/b.md 都应落盘
      expect(saveDocumentMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        '/docs/a.md'
      )
      expect(saveDocumentMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        '/docs/b.md'
      )
      // 无多余落盘（恰好 2 次）
      expect(saveDocumentMock).toHaveBeenCalledTimes(2)
    })

    it('pausedPaths ref is cleared after resumeAfterMutation (no state residue)', () => {
      openDirtyTab('/docs/a.md')
      const { result } = renderHook(() => useSavePipeline())

      act(() => {
        result.current.scheduleSave('/docs/a.md')
        result.current.pauseForPaths(['/docs/a.md'])
        // IPC 失败：原地恢复
        result.current.resumeAfterMutation('/docs/a.md', '/docs/a.md')
        vi.advanceTimersByTime(800)
      })

      // 第一次落盘完成后，再次 scheduleSave 不应触发额外保存（无残留 pausedPaths）
      saveDocumentMock.mockClear()

      // 标记为已保存，再调度时 clean，不应再落盘
      useDocumentStore.getState().markSaved(
        useDocumentStore.getState().tabForPath('/docs/a.md')!.content,
        '/docs/a.md'
      )

      act(() => {
        result.current.scheduleSave('/docs/a.md')
        vi.advanceTimersByTime(800)
      })

      expect(saveDocumentMock).not.toHaveBeenCalled()
    })
  })

  // ── 9. ⌘S 强存活动文档（未排队但 dirty 时也落盘） ────────────────────────

  describe('⌘S strong-save active document', () => {
    it('flushSaves alone does not save dirty-but-unscheduled active document', async () => {
      // 仅测基线行为：不 schedule，flushSaves 不落盘（边角情况复现）
      openDirtyTab('/active.md')
      const { result } = renderHook(() => useSavePipeline())

      // 不调用 scheduleSave — 模拟 active tab dirty 但队列为空
      await act(async () => {
        await result.current.flushSaves()
      })

      // 纯 flushSaves 不落盘（已知局限，被下面的修复覆盖）
      expect(saveDocumentMock).not.toHaveBeenCalled()
    })

    it('scheduleSave then flushSaves saves dirty active document not yet in queue', async () => {
      // 模拟 App.tsx ⌘S 修复后的行为：先 scheduleSave(activePath) 再 flushSaves()
      openDirtyTab('/active.md')
      const { result } = renderHook(() => useSavePipeline())

      // ⌘S 修复后的调用序列（App.tsx onSave handler）
      await act(async () => {
        result.current.scheduleSave('/active.md')
        await result.current.flushSaves()
      })

      expect(saveDocumentMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        '/active.md'
      )
      expect(saveDocumentMock).toHaveBeenCalledTimes(1)
    })

    it('⌘S on already-queued dirty document saves exactly once', async () => {
      openDirtyTab('/active.md')
      const { result } = renderHook(() => useSavePipeline())

      // 先排队（模拟已有 scheduleSave 在 debounce 中）
      act(() => {
        result.current.scheduleSave('/active.md')
      })

      // ⌘S 再次 schedule + flush — 应只落盘一次
      await act(async () => {
        result.current.scheduleSave('/active.md')
        await result.current.flushSaves()
      })

      expect(saveDocumentMock).toHaveBeenCalledTimes(1)
      expect(saveDocumentMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        '/active.md'
      )
    })
  })
})
