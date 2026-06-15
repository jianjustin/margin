import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.getState().reset()
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('saveDocument', () => {
  beforeEach(reset)
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes dirty active tab content and marks only that tab saved', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('b')
    store.openOrActivate('/notes/c.md', 'c')
    const writeFile = vi.fn().mockResolvedValue(undefined)

    await saveDocument(writeFile, undefined, '/notes/a.md')

    expect(writeFile).toHaveBeenCalledWith('/notes/a.md', 'b')
    expect(useDocumentStore.getState().tabForPath('/notes/a.md')!.saveStatus).toBe('saved')
    expect(useDocumentStore.getState().tabForPath('/notes/c.md')!.saveStatus).toBe('saved')
  })

  it('is a no-op when the target tab is clean', async () => {
    useDocumentStore.getState().openOrActivate('/notes/a.md', 'a')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    await saveDocument(writeFile, undefined, '/notes/a.md')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is a no-op when no matching tab is open', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined)
    await saveDocument(writeFile, undefined, '/notes/missing.md')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('coalesces concurrent saves per path and re-saves content changed mid-write', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('b')

    const writes: string[] = []
    const resolvers: Array<() => void> = []
    const writeFile = vi.fn((_path: string, content: string) => {
      writes.push(content)
      return new Promise<void>((res) => resolvers.push(res))
    })

    const first = saveDocument(writeFile, undefined, '/notes/a.md')
    store.setActiveContent('c')
    const second = saveDocument(writeFile, undefined, '/notes/a.md')

    expect(writes).toEqual(['b'])
    await second
    resolvers[0]()
    await tick()
    expect(writes).toEqual(['b', 'c'])
    resolvers[1]()
    await first
    expect(useDocumentStore.getState().tabForPath('/notes/a.md')!.saveStatus).toBe('saved')
  })

  it('allows different-path saves to run independently', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('a edited')
    store.openOrActivate('/notes/b.md', 'b')
    store.setActiveContent('b edited')

    const writes: string[] = []
    const resolvers: Array<() => void> = []
    const writeFile = vi.fn((path: string, content: string) => {
      writes.push(`${path}:${content}`)
      return new Promise<void>((res) => resolvers.push(res))
    })

    const first = saveDocument(writeFile, undefined, '/notes/a.md')
    const second = saveDocument(writeFile, undefined, '/notes/b.md')

    expect(writes).toEqual(['/notes/a.md:a edited', '/notes/b.md:b edited'])
    resolvers.forEach((resolve) => resolve())
    await Promise.all([first, second])
    expect(useDocumentStore.getState().tabForPath('/notes/a.md')!.saveStatus).toBe('saved')
    expect(useDocumentStore.getState().tabForPath('/notes/b.md')!.saveStatus).toBe('saved')
  })

  it('rechecks the target tab after readFile before deciding conflict or write', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'base')
    store.setActiveContent('mine')

    let resolveRead: (content: string) => void = () => {}
    const readFile = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })
    )
    const writeFile = vi.fn(() => Promise.resolve())

    const save = saveDocument(writeFile, readFile, '/notes/a.md')
    await tick()
    store.setActiveContent('disk')
    resolveRead('disk')
    await save

    const tab = useDocumentStore.getState().tabForPath('/notes/a.md')!
    expect(tab.conflict).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
    expect(tab.content).toBe('disk')
    expect(tab.savedContent).toBe('disk')
    expect(tab.saveStatus).toBe('saved')
  })

  it('marks only the target tab with an error when the write fails', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('b')
    store.openOrActivate('/notes/c.md', 'c')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const writeFile = vi.fn().mockRejectedValue(new Error('EACCES'))

    await saveDocument(writeFile, undefined, '/notes/a.md')

    expect(useDocumentStore.getState().tabForPath('/notes/a.md')!.saveStatus).toBe('error')
    expect(useDocumentStore.getState().tabForPath('/notes/c.md')!.saveStatus).toBe('saved')
  })

  it('blocks the save and raises a conflict when disk changed externally', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    const writeFile = vi.fn(() => Promise.resolve())
    const readFile = vi.fn(() => Promise.resolve('external change'))
    await saveDocument(writeFile, readFile, '/v/a.md')
    expect(writeFile).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().tabForPath('/v/a.md')!.conflict).toBe('external change')
  })

  it('saves normally when disk matches what the target tab last saw', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    const writeFile = vi.fn(() => Promise.resolve())
    const readFile = vi.fn(() => Promise.resolve('base'))
    await saveDocument(writeFile, readFile, '/v/a.md')
    expect(writeFile).toHaveBeenCalledWith('/v/a.md', 'mine')
    expect(useDocumentStore.getState().tabForPath('/v/a.md')!.saveStatus).toBe('saved')
  })

  it('ignores readFile errors and still saves the target tab', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    const writeFile = vi.fn(() => Promise.resolve())
    const readFile = vi.fn(() => Promise.reject(new Error('read failed')))

    await saveDocument(writeFile, readFile, '/v/a.md')

    expect(writeFile).toHaveBeenCalledWith('/v/a.md', 'mine')
    expect(useDocumentStore.getState().tabForPath('/v/a.md')!.saveStatus).toBe('saved')
  })
})
