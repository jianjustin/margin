import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.getState().reset()
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('saveDocument', () => {
  beforeEach(reset)

  it('writes dirty content and marks the document saved', async () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')
    const writeFile = vi.fn().mockResolvedValue(undefined)

    await saveDocument(writeFile)

    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledWith('/notes/a.md', 'b')
    expect(useDocumentStore.getState().saveStatus).toBe('saved')
    expect(useDocumentStore.getState().isDirty()).toBe(false)
  })

  it('is a no-op when the document is not dirty', async () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    const writeFile = vi.fn().mockResolvedValue(undefined)

    await saveDocument(writeFile)

    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is a no-op when no file is open', async () => {
    useDocumentStore.getState().setContent('orphan')
    const writeFile = vi.fn().mockResolvedValue(undefined)

    await saveDocument(writeFile)

    expect(writeFile).not.toHaveBeenCalled()
  })

  it('coalesces concurrent saves and re-saves content changed mid-write', async () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')

    const writes: string[] = []
    const resolvers: Array<() => void> = []
    const writeFile = vi.fn((_path: string, content: string) => {
      writes.push(content)
      return new Promise<void>((res) => resolvers.push(res))
    })

    const first = saveDocument(writeFile)
    // A second save is requested while the first write is still in flight.
    useDocumentStore.getState().setContent('c')
    const second = saveDocument(writeFile)

    // Only one write has gone out so far — no concurrent duplicate.
    expect(writes).toEqual(['b'])
    await second // returns immediately; it must not start its own write

    // Complete the first write; the orchestrator should notice the newer
    // content and write it out.
    resolvers[0]()
    await tick()
    expect(writes).toEqual(['b', 'c'])

    resolvers[1]()
    await first

    expect(writeFile).toHaveBeenCalledTimes(2)
    expect(useDocumentStore.getState().saveStatus).toBe('saved')
    expect(useDocumentStore.getState().isDirty()).toBe(false)
  })

  it('marks the store with an error and stays dirty when the write fails', async () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')
    const writeFile = vi.fn().mockRejectedValue(new Error('EACCES'))

    await saveDocument(writeFile)

    const s = useDocumentStore.getState()
    expect(s.saveStatus).toBe('error')
    expect(s.savedContent).toBe('a')
    expect(s.isDirty()).toBe(true)
  })

  it('recovers and saves on a later call after a failed write', async () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')

    const failing = vi.fn().mockRejectedValue(new Error('EACCES'))
    await saveDocument(failing)
    expect(useDocumentStore.getState().saveStatus).toBe('error')

    const ok = vi.fn().mockResolvedValue(undefined)
    await saveDocument(ok)

    expect(ok).toHaveBeenCalledTimes(1)
    expect(ok).toHaveBeenCalledWith('/notes/a.md', 'b')
    expect(useDocumentStore.getState().saveStatus).toBe('saved')
  })

  it('blocks the save and raises a conflict when disk changed externally', async () => {
    useDocumentStore.getState().load('/v/a.md', 'base')
    useDocumentStore.getState().setContent('mine')
    const writeFile = vi.fn(() => Promise.resolve())
    const readFile = vi.fn(() => Promise.resolve('external change'))
    await saveDocument(writeFile, readFile)
    expect(writeFile).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().conflict).toBe('external change')
  })

  it('saves normally when disk matches what we last saw', async () => {
    useDocumentStore.getState().load('/v/a.md', 'base')
    useDocumentStore.getState().setContent('mine')
    const writeFile = vi.fn(() => Promise.resolve())
    const readFile = vi.fn(() => Promise.resolve('base'))
    await saveDocument(writeFile, readFile)
    expect(writeFile).toHaveBeenCalledWith('/v/a.md', 'mine')
    expect(useDocumentStore.getState().saveStatus).toBe('saved')
  })
})
