// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDraft, DRAFT_INTERVAL_MS } from '@/hooks/useDraft'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    writeDraft: vi.fn(() => Promise.resolve()),
    deleteDraft: vi.fn(() => Promise.resolve())
  }
}))

beforeEach(() => {
  vi.useFakeTimers()
  useVaultStore.getState().openRoot('/vault', [])
  useDocumentStore.getState().load('/vault/a.md', 'disk')
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useDraft', () => {
  it('writes a draft after the interval while dirty, but not when clean', () => {
    const { unmount } = renderHook(() => useDraft())
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).not.toHaveBeenCalled() // clean → no draft

    useDocumentStore.getState().setContent('edited')
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).toHaveBeenCalledWith('/vault', '/vault/a.md', 'edited')

    // unchanged content → no duplicate write
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('deletes the draft when the document becomes saved', () => {
    const { unmount } = renderHook(() => useDraft())
    useDocumentStore.getState().setContent('edited')
    useDocumentStore.getState().markSaved('edited')
    expect(api.deleteDraft).toHaveBeenCalledWith('/vault', '/vault/a.md')
    unmount()
  })

  it('does not delete the new file draft when switching from a dirty file', () => {
    const { unmount } = renderHook(() => useDraft())
    useDocumentStore.getState().setContent('edited') // current file dirty
    useDocumentStore.getState().load('/vault/b.md', 'disk-b') // switch file: dirty → saved
    expect(api.deleteDraft).not.toHaveBeenCalled()
    unmount()
  })
})
