import { create } from 'zustand'

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'

export interface DocumentTab {
  path: string
  content: string
  savedContent: string
  saveStatus: SaveStatus
  epoch: number
  pendingDraft: string | null
  conflict: string | null
}

interface DocumentState {
  tabs: DocumentTab[]
  activePath: string | null
  path: string | null
  content: string
  savedContent: string
  saveStatus: SaveStatus
  epoch: number
  pendingDraft: string | null
  conflict: string | null
  activeTab(): DocumentTab | null
  tabForPath(path: string | null): DocumentTab | null
  dirtyTabs(): DocumentTab[]
  isDirty(path?: string): boolean
  openOrActivate(path: string, content: string): void
  load(path: string, content: string): void
  setActivePath(path: string | null): void
  setActiveContent(content: string): void
  setContent(content: string): void
  markSaving(path?: string): void
  markSaved(content: string, path?: string): void
  markError(path?: string): void
  closeTab(path: string): void
  replacePath(oldPath: string, newPath: string, content?: string): void
  removePath(path: string): void
  reset(): void
  setPendingDraft(pathOrDraft: string | null, draft?: string | null): void
  applyDraft(path?: string): void
  setConflict(pathOrDisk: string, disk?: string): void
  keepMine(path?: string): void
  takeDisk(path?: string): void
  reloadFromDisk(path: string, content: string): void
}

function createTab(path: string, content: string, epoch = 0): DocumentTab {
  return {
    path,
    content,
    savedContent: content,
    saveStatus: 'saved',
    epoch,
    pendingDraft: null,
    conflict: null
  }
}

function activeTab(state: Pick<DocumentState, 'tabs' | 'activePath'>): DocumentTab | null {
  return state.tabs.find((tab) => tab.path === state.activePath) ?? null
}

function deriveActiveFields(state: Pick<DocumentState, 'tabs' | 'activePath'>): Pick<
  DocumentState,
  'path' | 'content' | 'savedContent' | 'saveStatus' | 'epoch' | 'pendingDraft' | 'conflict'
> {
  const tab = activeTab(state)
  return {
    path: tab?.path ?? null,
    content: tab?.content ?? '',
    savedContent: tab?.savedContent ?? '',
    saveStatus: tab?.saveStatus ?? 'saved',
    epoch: tab?.epoch ?? 0,
    pendingDraft: tab?.pendingDraft ?? null,
    conflict: tab?.conflict ?? null
  }
}

function withDerived<T extends Partial<DocumentState> & Pick<DocumentState, 'tabs' | 'activePath'>>(
  state: T
): T & ReturnType<typeof deriveActiveFields> {
  return { ...state, ...deriveActiveFields(state) }
}

function updateTab(
  tabs: DocumentTab[],
  path: string | null,
  updater: (tab: DocumentTab) => DocumentTab
): DocumentTab[] {
  if (!path) return tabs
  return tabs.map((tab) => (tab.path === path ? updater(tab) : tab))
}

function nextActivePath(tabs: DocumentTab[], closingPath: string, activePath: string | null): string | null {
  if (activePath !== closingPath) return activePath
  const index = tabs.findIndex((tab) => tab.path === closingPath)
  if (index === -1) return activePath
  return tabs[index + 1]?.path ?? tabs[index - 1]?.path ?? null
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  tabs: [],
  activePath: null,
  path: null,
  content: '',
  savedContent: '',
  saveStatus: 'saved',
  epoch: 0,
  pendingDraft: null,
  conflict: null,

  activeTab: () => activeTab(get()),

  tabForPath: (path) => (path ? get().tabs.find((tab) => tab.path === path) ?? null : null),

  dirtyTabs: () => get().tabs.filter((tab) => tab.content !== tab.savedContent),

  isDirty: (path) => {
    const tab = path ? get().tabForPath(path) : get().activeTab()
    return tab ? tab.content !== tab.savedContent : false
  },

  openOrActivate: (path, content) =>
    set((state) => {
      const exists = state.tabs.some((tab) => tab.path === path)
      return withDerived({
        tabs: exists ? state.tabs : [...state.tabs, createTab(path, content)],
        activePath: path
      })
    }),

  load: (path, content) =>
    set((state) => {
      const exists = state.tabs.some((tab) => tab.path === path)
      return withDerived({
        tabs: exists
          ? updateTab(state.tabs, path, (tab) => ({
              ...tab,
              content,
              savedContent: content,
              saveStatus: 'saved',
              pendingDraft: null,
              conflict: null,
              epoch: tab.epoch + 1
            }))
          : [...state.tabs, createTab(path, content, 1)],
        activePath: path
      })
    }),

  setActivePath: (path) =>
    set((state) => {
      const activePath = path && state.tabs.some((tab) => tab.path === path) ? path : null
      return withDerived({ tabs: state.tabs, activePath })
    }),

  setActiveContent: (content) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, state.activePath, (tab) => ({
          ...tab,
          content,
          saveStatus: content === tab.savedContent ? 'saved' : 'dirty'
        })),
        activePath: state.activePath
      })
    ),

  setContent: (content) => get().setActiveContent(content),

  markSaving: (path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) => ({ ...tab, saveStatus: 'saving' })),
        activePath: state.activePath
      })
    ),

  markSaved: (content, path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) => ({
          ...tab,
          savedContent: content,
          saveStatus: tab.content === content ? 'saved' : 'dirty'
        })),
        activePath: state.activePath
      })
    ),

  markError: (path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) => ({ ...tab, saveStatus: 'error' })),
        activePath: state.activePath
      })
    ),

  closeTab: (path) =>
    set((state) => {
      const activePath = nextActivePath(state.tabs, path, state.activePath)
      return withDerived({
        tabs: state.tabs.filter((tab) => tab.path !== path),
        activePath
      })
    }),

  replacePath: (oldPath, newPath, content) =>
    set((state) =>
      withDerived({
        tabs: state.tabs.map((tab) =>
          tab.path === oldPath
            ? {
                ...tab,
                path: newPath,
                content: content ?? tab.content,
                savedContent: content ?? tab.savedContent,
                saveStatus: content == null ? tab.saveStatus : 'saved',
                pendingDraft: null,
                conflict: null,
                epoch: tab.epoch + 1
              }
            : tab
        ),
        activePath: state.activePath === oldPath ? newPath : state.activePath
      })
    ),

  removePath: (path) => get().closeTab(path),

  reset: () =>
    set(
      withDerived({
        tabs: [],
        activePath: null
      })
    ),

  setPendingDraft: (pathOrDraft, draft) =>
    set((state) => {
      const path = draft === undefined ? state.activePath : pathOrDraft
      const value = draft === undefined ? pathOrDraft : draft
      return withDerived({
        tabs: updateTab(state.tabs, path, (tab) => ({ ...tab, pendingDraft: value })),
        activePath: state.activePath
      })
    }),

  applyDraft: (path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) =>
          tab.pendingDraft == null
            ? tab
            : {
                ...tab,
                content: tab.pendingDraft,
                saveStatus: tab.pendingDraft === tab.savedContent ? 'saved' : 'dirty',
                pendingDraft: null,
                epoch: tab.epoch + 1
              }
        ),
        activePath: state.activePath
      })
    ),

  setConflict: (pathOrDisk, disk) =>
    set((state) => {
      const path = disk === undefined ? state.activePath : pathOrDisk
      const value = disk === undefined ? pathOrDisk : disk
      return withDerived({
        tabs: updateTab(state.tabs, path, (tab) => ({ ...tab, conflict: value })),
        activePath: state.activePath
      })
    }),

  keepMine: (path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) =>
          tab.conflict == null
            ? tab
            : {
                ...tab,
                savedContent: tab.conflict,
                saveStatus: tab.content === tab.conflict ? 'saved' : 'dirty',
                conflict: null
              }
        ),
        activePath: state.activePath
      })
    ),

  takeDisk: (path) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path ?? state.activePath, (tab) =>
          tab.conflict == null
            ? tab
            : {
                ...tab,
                content: tab.conflict,
                savedContent: tab.conflict,
                saveStatus: 'saved',
                conflict: null,
                epoch: tab.epoch + 1
              }
        ),
        activePath: state.activePath
      })
    ),

  reloadFromDisk: (path, content) =>
    set((state) =>
      withDerived({
        tabs: updateTab(state.tabs, path, (tab) => ({
          ...tab,
          content,
          savedContent: content,
          saveStatus: 'saved',
          conflict: null,
          epoch: tab.epoch + 1
        })),
        activePath: state.activePath
      })
    )
}))
