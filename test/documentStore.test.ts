import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.setState({
    path: null,
    content: '',
    savedContent: '',
    saveStatus: 'saved',
    pendingDraft: null,
    conflict: null,
    epoch: 0
  })
}

describe('documentStore', () => {
  beforeEach(reset)

  it('starts clean with no file', () => {
    const s = useDocumentStore.getState()
    expect(s.path).toBeNull()
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('load sets path/content and is clean', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    const s = useDocumentStore.getState()
    expect(s.path).toBe('/notes/a.md')
    expect(s.content).toBe('# Hello')
    expect(s.savedContent).toBe('# Hello')
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('editing content marks the document dirty', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    useDocumentStore.getState().setContent('# Hello world')
    const s = useDocumentStore.getState()
    expect(s.isDirty()).toBe(true)
    expect(s.saveStatus).toBe('dirty')
  })

  it('setting content back to saved value is not dirty', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    useDocumentStore.getState().setContent('changed')
    useDocumentStore.getState().setContent('# Hello')
    expect(useDocumentStore.getState().isDirty()).toBe(false)
  })

  it('markSaving then markSaved clears dirty and syncs savedContent', () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')
    useDocumentStore.getState().markSaving()
    expect(useDocumentStore.getState().saveStatus).toBe('saving')
    useDocumentStore.getState().markSaved('b')
    const s = useDocumentStore.getState()
    expect(s.savedContent).toBe('b')
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('markError flags an error and leaves the document dirty for retry', () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')
    useDocumentStore.getState().markSaving()
    useDocumentStore.getState().markError()
    const s = useDocumentStore.getState()
    expect(s.saveStatus).toBe('error')
    expect(s.savedContent).toBe('a')
    expect(s.isDirty()).toBe(true)
  })
})

describe('draft restore & epoch', () => {
  beforeEach(reset)

  it('load clears pendingDraft/conflict and bumps epoch', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    s.setPendingDraft('draft!')
    const epochBefore = useDocumentStore.getState().epoch
    s.load('/v/b.md', 'other')
    expect(useDocumentStore.getState().pendingDraft).toBeNull()
    expect(useDocumentStore.getState().epoch).toBe(epochBefore + 1)
  })

  it('applyDraft makes the draft the dirty content and bumps epoch', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    s.setPendingDraft('draft!')
    const epochBefore = useDocumentStore.getState().epoch
    useDocumentStore.getState().applyDraft()
    const after = useDocumentStore.getState()
    expect(after.content).toBe('draft!')
    expect(after.savedContent).toBe('disk')
    expect(after.saveStatus).toBe('dirty')
    expect(after.pendingDraft).toBeNull()
    expect(after.epoch).toBe(epochBefore + 1)
  })

  it('applyDraft is a no-op without a pending draft', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    useDocumentStore.getState().applyDraft()
    expect(useDocumentStore.getState().content).toBe('disk')
  })
})
