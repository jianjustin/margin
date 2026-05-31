import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.setState({
    path: null,
    content: '',
    savedContent: '',
    saveStatus: 'saved'
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
})
