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
  useDocumentStore.getState().reset()
  useDocumentStore.getState().openOrActivate('/vault/a.md', 'disk-a')
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useDraft', () => {
  it('writes a draft for each dirty tab after the interval', () => {
    const { unmount } = renderHook(() => useDraft())
    const store = useDocumentStore.getState()
    store.setActiveContent('edited-a')
    store.openOrActivate('/vault/b.md', 'disk-b')
    store.setActiveContent('edited-b')

    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)

    expect(api.writeDraft).toHaveBeenCalledWith('/vault', '/vault/a.md', 'edited-a')
    expect(api.writeDraft).toHaveBeenCalledWith('/vault', '/vault/b.md', 'edited-b')
    unmount()
  })

  it('does not write duplicate drafts for unchanged dirty tab content', () => {
    const { unmount } = renderHook(() => useDraft())
    useDocumentStore.getState().setActiveContent('edited')
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('deletes only the saved tab draft when that tab becomes saved', () => {
    const { unmount } = renderHook(() => useDraft())
    const store = useDocumentStore.getState()
    store.setActiveContent('edited-a')
    store.openOrActivate('/vault/b.md', 'disk-b')
    store.setActiveContent('edited-b')
    store.markSaved('edited-b', '/vault/b.md')

    expect(api.deleteDraft).toHaveBeenCalledWith('/vault', '/vault/b.md')
    expect(api.deleteDraft).not.toHaveBeenCalledWith('/vault', '/vault/a.md')
    unmount()
  })

  it('does not delete a draft when switching active tabs', () => {
    const { unmount } = renderHook(() => useDraft())
    const store = useDocumentStore.getState()
    store.setActiveContent('edited-a')
    store.openOrActivate('/vault/b.md', 'disk-b')
    expect(api.deleteDraft).not.toHaveBeenCalled()
    unmount()
  })
})
