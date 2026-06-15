import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.getState().reset()
}

describe('documentStore tabs', () => {
  beforeEach(reset)

  it('starts clean with no tabs', () => {
    const s = useDocumentStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activePath).toBeNull()
    expect(s.activeTab()).toBeNull()
    expect(s.path).toBeNull()
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('openOrActivate creates a tab and exposes it as the active document', () => {
    useDocumentStore.getState().openOrActivate('/notes/a.md', '# A')
    const s = useDocumentStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.activePath).toBe('/notes/a.md')
    expect(s.path).toBe('/notes/a.md')
    expect(s.content).toBe('# A')
    expect(s.savedContent).toBe('# A')
    expect(s.saveStatus).toBe('saved')
    expect(s.epoch).toBe(0)
    expect(s.pendingDraft).toBeNull()
    expect(s.conflict).toBeNull()
    expect(s.isDirty()).toBe(false)
  })

  it('openOrActivate activates an existing path without duplicating a tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'disk-a')
    store.setActiveContent('edited-a')
    store.openOrActivate('/notes/b.md', 'disk-b')
    store.openOrActivate('/notes/a.md', 'new disk ignored')
    const s = useDocumentStore.getState()
    expect(s.tabs.map((tab) => tab.path)).toEqual(['/notes/a.md', '/notes/b.md'])
    expect(s.activePath).toBe('/notes/a.md')
    expect(s.content).toBe('edited-a')
    expect(s.isDirty()).toBe(true)
  })

  it('load creates a clean active tab and bumps epoch from empty state', () => {
    const store = useDocumentStore.getState()
    store.load('/notes/new.md', 'disk-new')
    const s = useDocumentStore.getState()
    const tab = s.tabForPath('/notes/new.md')!
    expect(s.tabs.map((item) => item.path)).toEqual(['/notes/new.md'])
    expect(s.activePath).toBe('/notes/new.md')
    expect(s.path).toBe('/notes/new.md')
    expect(s.content).toBe('disk-new')
    expect(s.savedContent).toBe('disk-new')
    expect(s.saveStatus).toBe('saved')
    expect(s.epoch).toBe(1)
    expect(tab.epoch).toBe(1)
    expect(s.pendingDraft).toBeNull()
    expect(s.conflict).toBeNull()
  })

  it('load replaces an already-open tab with disk content and bumps epoch', () => {
    const store = useDocumentStore.getState()
    store.load('/notes/a.md', 'disk-a')
    store.setActiveContent('edited-a')
    store.setPendingDraft('/notes/a.md', 'draft-a')
    store.setConflict('/notes/a.md', 'theirs-a')
    store.openOrActivate('/notes/b.md', 'disk-b')
    const before = useDocumentStore.getState().tabForPath('/notes/a.md')!.epoch
    store.load('/notes/a.md', 'new disk-a')
    const a = useDocumentStore.getState().tabForPath('/notes/a.md')!
    const b = useDocumentStore.getState().tabForPath('/notes/b.md')!
    expect(useDocumentStore.getState().activePath).toBe('/notes/a.md')
    expect(a.content).toBe('new disk-a')
    expect(a.savedContent).toBe('new disk-a')
    expect(a.saveStatus).toBe('saved')
    expect(a.pendingDraft).toBeNull()
    expect(a.conflict).toBeNull()
    expect(a.epoch).toBe(before + 1)
    expect(b.content).toBe('disk-b')
  })

  it('setActivePath switches tabs without changing either tab content', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('a edited')
    store.openOrActivate('/notes/b.md', 'b')
    store.setActivePath('/notes/a.md')
    expect(useDocumentStore.getState().content).toBe('a edited')
    store.setActivePath('/notes/b.md')
    expect(useDocumentStore.getState().content).toBe('b')
  })

  it('setActivePath clears active compatibility fields for an unknown path', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActivePath('/notes/missing.md')
    const s = useDocumentStore.getState()
    expect(s.activePath).toBeNull()
    expect(s.activeTab()).toBeNull()
    expect(s.path).toBeNull()
    expect(s.content).toBe('')
    expect(s.savedContent).toBe('')
    expect(s.saveStatus).toBe('saved')
    expect(s.epoch).toBe(0)
    expect(s.pendingDraft).toBeNull()
    expect(s.conflict).toBeNull()
  })

  it('closeTab activates the right neighbor, then the left neighbor, then none', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.openOrActivate('/notes/b.md', 'b')
    store.openOrActivate('/notes/c.md', 'c')
    store.setActivePath('/notes/b.md')
    store.closeTab('/notes/b.md')
    expect(useDocumentStore.getState().activePath).toBe('/notes/c.md')
    store.closeTab('/notes/c.md')
    expect(useDocumentStore.getState().activePath).toBe('/notes/a.md')
    store.closeTab('/notes/a.md')
    expect(useDocumentStore.getState().activePath).toBeNull()
  })

  it('replacePath updates an open tab after rename or move', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('edited')
    store.replacePath('/notes/a.md', '/notes/renamed.md')
    const s = useDocumentStore.getState()
    expect(s.activePath).toBe('/notes/renamed.md')
    expect(s.path).toBe('/notes/renamed.md')
    expect(s.content).toBe('edited')
  })

  it('replacePath preserves draft and conflict banner state when content is omitted', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'disk')
    store.setActiveContent('mine')
    store.setPendingDraft('/notes/a.md', 'draft')
    store.setConflict('/notes/a.md', 'theirs')
    const before = useDocumentStore.getState().tabForPath('/notes/a.md')!.epoch

    store.replacePath('/notes/a.md', '/notes/renamed.md')

    const tab = useDocumentStore.getState().tabForPath('/notes/renamed.md')!
    expect(tab.content).toBe('mine')
    expect(tab.savedContent).toBe('disk')
    expect(tab.pendingDraft).toBe('draft')
    expect(tab.conflict).toBe('theirs')
    expect(tab.epoch).toBe(before + 1)
  })

  it('replacePath clears draft and conflict banner state when content replaces disk state', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'disk')
    store.setActiveContent('mine')
    store.setPendingDraft('/notes/a.md', 'draft')
    store.setConflict('/notes/a.md', 'theirs')

    store.replacePath('/notes/a.md', '/notes/renamed.md', 'new disk')

    const tab = useDocumentStore.getState().tabForPath('/notes/renamed.md')!
    expect(tab.content).toBe('new disk')
    expect(tab.savedContent).toBe('new disk')
    expect(tab.saveStatus).toBe('saved')
    expect(tab.pendingDraft).toBeNull()
    expect(tab.conflict).toBeNull()
  })

  it('removePath closes the matching tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.openOrActivate('/notes/b.md', 'b')
    store.removePath('/notes/b.md')
    const s = useDocumentStore.getState()
    expect(s.tabs.map((tab) => tab.path)).toEqual(['/notes/a.md'])
    expect(s.activePath).toBe('/notes/a.md')
  })

  it('dirtyTabs and isDirty(path) report dirty state per tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('a edited')
    store.openOrActivate('/notes/b.md', 'b')
    expect(store.dirtyTabs().map((tab) => tab.path)).toEqual(['/notes/a.md'])
    expect(store.isDirty('/notes/a.md')).toBe(true)
    expect(store.isDirty('/notes/b.md')).toBe(false)
    expect(store.isDirty('/notes/missing.md')).toBe(false)
  })

  it('path-targeted save status actions update only the requested tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('a edited')
    store.openOrActivate('/notes/b.md', 'b')
    store.setActiveContent('b edited')
    store.markSaving('/notes/a.md')
    expect(store.tabForPath('/notes/a.md')!.saveStatus).toBe('saving')
    expect(store.tabForPath('/notes/b.md')!.saveStatus).toBe('dirty')
    store.markSaved('a edited', '/notes/a.md')
    expect(store.tabForPath('/notes/a.md')!.saveStatus).toBe('saved')
    expect(store.tabForPath('/notes/a.md')!.savedContent).toBe('a edited')
    expect(store.tabForPath('/notes/b.md')!.saveStatus).toBe('dirty')
    store.markError('/notes/b.md')
    expect(store.tabForPath('/notes/a.md')!.saveStatus).toBe('saved')
    expect(store.tabForPath('/notes/b.md')!.saveStatus).toBe('error')
  })

  it('reloadFromDisk replaces only the target tab and bumps its epoch', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('a edited')
    store.setConflict('/notes/a.md', 'external-a')
    store.openOrActivate('/notes/b.md', 'b')
    store.setActiveContent('b edited')
    const beforeA = store.tabForPath('/notes/a.md')!.epoch
    const beforeB = store.tabForPath('/notes/b.md')!.epoch
    store.reloadFromDisk('/notes/a.md', 'disk-a-new')
    const a = store.tabForPath('/notes/a.md')!
    const b = store.tabForPath('/notes/b.md')!
    expect(a.content).toBe('disk-a-new')
    expect(a.savedContent).toBe('disk-a-new')
    expect(a.saveStatus).toBe('saved')
    expect(a.conflict).toBeNull()
    expect(a.epoch).toBe(beforeA + 1)
    expect(b.content).toBe('b edited')
    expect(b.savedContent).toBe('b')
    expect(b.saveStatus).toBe('dirty')
    expect(b.epoch).toBe(beforeB)
  })

  it('reset clears tabs and active compatibility fields', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('edited')
    store.setPendingDraft('/notes/a.md', 'draft')
    store.setConflict('/notes/a.md', 'external')
    store.reset()
    const s = useDocumentStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activePath).toBeNull()
    expect(s.path).toBeNull()
    expect(s.content).toBe('')
    expect(s.savedContent).toBe('')
    expect(s.saveStatus).toBe('saved')
    expect(s.epoch).toBe(0)
    expect(s.pendingDraft).toBeNull()
    expect(s.conflict).toBeNull()
    expect(s.isDirty()).toBe(false)
  })
})

describe('documentStore draft and conflict per tab', () => {
  beforeEach(reset)

  it('applyDraft makes only the target tab dirty and bumps its epoch', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'disk-a')
    store.openOrActivate('/v/b.md', 'disk-b')
    store.setPendingDraft('/v/a.md', 'draft-a')
    store.setPendingDraft('/v/b.md', 'draft-b')
    const before = useDocumentStore.getState().tabForPath('/v/a.md')!.epoch
    const bBefore = useDocumentStore.getState().tabForPath('/v/b.md')!
    store.applyDraft('/v/a.md')
    const a = useDocumentStore.getState().tabForPath('/v/a.md')!
    const b = useDocumentStore.getState().tabForPath('/v/b.md')!
    expect(a.content).toBe('draft-a')
    expect(a.savedContent).toBe('disk-a')
    expect(a.saveStatus).toBe('dirty')
    expect(a.pendingDraft).toBeNull()
    expect(a.epoch).toBe(before + 1)
    expect(b.content).toBe('disk-b')
    expect(b.savedContent).toBe('disk-b')
    expect(b.pendingDraft).toBe('draft-b')
    expect(b.epoch).toBe(bBefore.epoch)
    expect(b.saveStatus).toBe(bBefore.saveStatus)
  })

  it('keepMine adopts disk as savedContent for the target tab and stays dirty', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    store.setConflict('/v/a.md', 'theirs')
    store.openOrActivate('/v/b.md', 'base-b')
    store.setActiveContent('mine-b')
    store.setConflict('/v/b.md', 'theirs-b')
    store.keepMine('/v/a.md')
    const a = useDocumentStore.getState().tabForPath('/v/a.md')!
    const b = useDocumentStore.getState().tabForPath('/v/b.md')!
    expect(a.conflict).toBeNull()
    expect(a.savedContent).toBe('theirs')
    expect(a.saveStatus).toBe('dirty')
    expect(a.content).toBe('mine')
    expect(b.conflict).toBe('theirs-b')
    expect(b.savedContent).toBe('base-b')
    expect(b.saveStatus).toBe('dirty')
    expect(b.content).toBe('mine-b')
  })

  it('takeDisk replaces target tab content, marks saved, and bumps epoch', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    store.setConflict('/v/a.md', 'theirs')
    store.openOrActivate('/v/b.md', 'base-b')
    store.setActiveContent('mine-b')
    store.setConflict('/v/b.md', 'theirs-b')
    const before = useDocumentStore.getState().tabForPath('/v/a.md')!.epoch
    store.takeDisk('/v/a.md')
    const a = useDocumentStore.getState().tabForPath('/v/a.md')!
    const b = useDocumentStore.getState().tabForPath('/v/b.md')!
    expect(a.content).toBe('theirs')
    expect(a.savedContent).toBe('theirs')
    expect(a.saveStatus).toBe('saved')
    expect(a.conflict).toBeNull()
    expect(a.epoch).toBe(before + 1)
    expect(b.conflict).toBe('theirs-b')
    expect(b.content).toBe('mine-b')
    expect(b.savedContent).toBe('base-b')
    expect(b.saveStatus).toBe('dirty')
  })
})
