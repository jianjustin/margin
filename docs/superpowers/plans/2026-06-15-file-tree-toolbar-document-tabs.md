# File Tree Toolbar and Document Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the left titlebar action group into the file tree header and add true current-session multi-tab document editing with one tab per file path.

**Architecture:** Convert `documentStore` from a single-document store to `tabs + activePath`, then migrate save, draft, vault-watch, and UI consumers to active-tab helpers. Add a dedicated `DocumentTabs` component above the editor, and move folder/search/schedule/collapse controls into `Sidebar` while keeping a restore-sidebar control in the global titlebar when collapsed.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library, Tauri renderer APIs, lucide-react, Tailwind utility classes.

---

## File Structure

- Modify `src/renderer/src/stores/documentStore.ts`
  - Owns all per-tab document state and active-tab actions.
- Modify `src/renderer/src/lib/saveDocument.ts`
  - Saves a specific tab or the active tab without blocking unrelated tabs.
- Modify `src/renderer/src/hooks/useDraft.ts`
  - Writes/deletes crash-recovery drafts per dirty tab.
- Modify `src/renderer/src/hooks/useVaultWatch.ts`
  - Reconciles all open tabs after vault changes.
- Create `src/renderer/src/components/DocumentTabs.tsx`
  - Renders tab strip and close buttons.
- Modify `src/renderer/src/components/FileTree/Sidebar.tsx`
  - Adds file tree toolbar in the approved order.
- Modify `src/renderer/src/components/StatusBar.tsx`
  - Reads stats and save status from the active tab.
- Modify `src/renderer/src/components/DraftBanner.tsx`
  - Applies/discards draft for the active tab.
- Modify `src/renderer/src/components/ConflictBar.tsx`
  - Resolves conflict for the active tab.
- Modify `src/renderer/src/components/OutlineDrawer.tsx`
  - Reads active tab content.
- Modify `src/renderer/src/components/BacklinksPanel.tsx`
  - Reads active path.
- Modify `src/renderer/src/App.tsx`
  - Wires toolbar props, tab strip, open/activate flow, editor key/value, titlebar restore button, context-menu path updates.
- Modify tests:
  - `test/documentStore.test.ts`
  - `test/saveDocument.test.ts`
  - `test/useDraft.test.tsx`
  - `test/fileTree-dom.test.tsx`
  - `test/statusBar-dom.test.tsx`
  - `test/app-rerender.test.tsx`
  - Create `test/documentTabs-dom.test.tsx`

## Task 1: Multi-Tab Document Store

**Files:**
- Modify: `src/renderer/src/stores/documentStore.ts`
- Test: `test/documentStore.test.ts`

- [ ] **Step 1: Replace the store tests with multi-tab expectations**

Replace `test/documentStore.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.setState({
    tabs: [],
    activePath: null
  })
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

  it('removePath closes the matching tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.openOrActivate('/notes/b.md', 'b')
    store.removePath('/notes/b.md')
    const s = useDocumentStore.getState()
    expect(s.tabs.map((tab) => tab.path)).toEqual(['/notes/a.md'])
    expect(s.activePath).toBe('/notes/a.md')
  })
})

describe('documentStore draft and conflict per tab', () => {
  beforeEach(reset)

  it('applyDraft makes only the target tab dirty and bumps its epoch', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'disk-a')
    store.openOrActivate('/v/b.md', 'disk-b')
    store.setPendingDraft('/v/a.md', 'draft-a')
    const before = useDocumentStore.getState().tabForPath('/v/a.md')!.epoch
    store.applyDraft('/v/a.md')
    const a = useDocumentStore.getState().tabForPath('/v/a.md')!
    const b = useDocumentStore.getState().tabForPath('/v/b.md')!
    expect(a.content).toBe('draft-a')
    expect(a.savedContent).toBe('disk-a')
    expect(a.saveStatus).toBe('dirty')
    expect(a.pendingDraft).toBeNull()
    expect(a.epoch).toBe(before + 1)
    expect(b.content).toBe('disk-b')
  })

  it('keepMine adopts disk as savedContent for the target tab and stays dirty', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    store.setConflict('/v/a.md', 'theirs')
    store.keepMine('/v/a.md')
    const tab = useDocumentStore.getState().tabForPath('/v/a.md')!
    expect(tab.conflict).toBeNull()
    expect(tab.savedContent).toBe('theirs')
    expect(tab.saveStatus).toBe('dirty')
    expect(tab.content).toBe('mine')
  })

  it('takeDisk replaces target tab content, marks saved, and bumps epoch', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'base')
    store.setActiveContent('mine')
    store.setConflict('/v/a.md', 'theirs')
    const before = useDocumentStore.getState().tabForPath('/v/a.md')!.epoch
    store.takeDisk('/v/a.md')
    const tab = useDocumentStore.getState().tabForPath('/v/a.md')!
    expect(tab.content).toBe('theirs')
    expect(tab.savedContent).toBe('theirs')
    expect(tab.saveStatus).toBe('saved')
    expect(tab.conflict).toBeNull()
    expect(tab.epoch).toBe(before + 1)
  })
})
```

- [ ] **Step 2: Run the document store test and verify it fails**

Run:

```bash
npm run test -- test/documentStore.test.ts
```

Expected: FAIL because `openOrActivate`, `activeTab`, `tabForPath`, `setActiveContent`, `closeTab`, `replacePath`, and `removePath` do not exist yet.

- [ ] **Step 3: Replace `documentStore.ts` with the multi-tab store**

Replace `src/renderer/src/stores/documentStore.ts` with:

```ts
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

function createTab(path: string, content: string): DocumentTab {
  return {
    path,
    content,
    savedContent: content,
    saveStatus: 'saved',
    epoch: 0,
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
      const next = {
        tabs: exists ? state.tabs : [...state.tabs, createTab(path, content)],
        activePath: path
      }
      return withDerived(next)
    }),

  load: (path, content) => get().openOrActivate(path, content),

  setActivePath: (path) =>
    set((state) => {
      const nextPath = path && state.tabs.some((tab) => tab.path === path) ? path : null
      return withDerived({ tabs: state.tabs, activePath: nextPath })
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
```

- [ ] **Step 4: Run the document store test and verify it passes**

Run:

```bash
npm run test -- test/documentStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the store change**

```bash
git add src/renderer/src/stores/documentStore.ts test/documentStore.test.ts
git commit -m "feat(document): add multi-tab document store"
```

## Task 2: Per-Tab Save, Draft, and Vault Watch

**Files:**
- Modify: `src/renderer/src/lib/saveDocument.ts`
- Modify: `src/renderer/src/hooks/useDraft.ts`
- Modify: `src/renderer/src/hooks/useVaultWatch.ts`
- Test: `test/saveDocument.test.ts`
- Test: `test/useDraft.test.tsx`

- [ ] **Step 1: Update save tests for path-aware saves**

Replace `test/saveDocument.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.setState({ tabs: [], activePath: null })
  useDocumentStore.getState().reset()
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('saveDocument', () => {
  beforeEach(reset)

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

  it('marks only the target tab with an error when the write fails', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/notes/a.md', 'a')
    store.setActiveContent('b')
    store.openOrActivate('/notes/c.md', 'c')
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
})
```

- [ ] **Step 2: Update draft tests for multiple dirty tabs**

Replace `test/useDraft.test.tsx` with:

```tsx
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
```

- [ ] **Step 3: Run save and draft tests and verify they fail**

Run:

```bash
npm run test -- test/saveDocument.test.ts test/useDraft.test.tsx
```

Expected: FAIL because `saveDocument` and `useDraft` still read single-document fields.

- [ ] **Step 4: Make `saveDocument` path-aware**

Replace `src/renderer/src/lib/saveDocument.ts` with:

```ts
import { useDocumentStore } from '@/stores/documentStore'

type WriteFile = (path: string, content: string) => Promise<void>
type ReadFile = (path: string) => Promise<string>

const savingPaths = new Set<string>()

export async function saveDocument(
  writeFile: WriteFile,
  readFile?: ReadFile,
  targetPath?: string
): Promise<void> {
  const store = useDocumentStore
  const path = targetPath ?? store.getState().activePath
  if (!path || savingPaths.has(path)) return

  let tab = store.getState().tabForPath(path)
  if (!tab || tab.content === tab.savedContent || tab.conflict != null) return

  savingPaths.add(path)
  try {
    while (true) {
      tab = store.getState().tabForPath(path)
      if (!tab || tab.content === tab.savedContent || tab.conflict != null) break

      const { content, savedContent } = tab
      if (readFile) {
        const disk = await readFile(path).catch(() => null)
        if (disk != null && disk !== savedContent && disk !== content) {
          store.getState().setConflict(path, disk)
          break
        }
      }

      store.getState().markSaving(path)
      await writeFile(path, content)
      store.getState().markSaved(content, path)
    }
  } catch (err) {
    console.error('Failed to save document:', err)
    store.getState().markError(path)
  } finally {
    savingPaths.delete(path)
  }
}
```

- [ ] **Step 5: Make `useDraft` scan dirty tabs**

Replace `src/renderer/src/hooks/useDraft.ts` with:

```ts
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

export const DRAFT_INTERVAL_MS = 2000

export function useDraft(): void {
  useEffect(() => {
    const lastWritten = new Map<string, string>()

    const timer = setInterval(() => {
      const root = useVaultStore.getState().root
      if (!root) return
      for (const tab of useDocumentStore.getState().dirtyTabs()) {
        if (tab.content === lastWritten.get(tab.path)) continue
        lastWritten.set(tab.path, tab.content)
        void api.writeDraft(root, tab.path, tab.content).catch(() => {})
      }
    }, DRAFT_INTERVAL_MS)

    const unsub = useDocumentStore.subscribe((s, prev) => {
      const root = useVaultStore.getState().root
      if (!root) return

      for (const tab of s.tabs) {
        const previous = prev.tabs.find((item) => item.path === tab.path)
        if (tab.saveStatus === 'saved' && previous?.saveStatus !== 'saved') {
          lastWritten.delete(tab.path)
          void api.deleteDraft(root, tab.path).catch(() => {})
        }
      }
      for (const previous of prev.tabs) {
        if (!s.tabs.some((tab) => tab.path === previous.path)) {
          lastWritten.delete(previous.path)
        }
      }
    })

    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])
}
```

- [ ] **Step 6: Update `useVaultWatch` to reconcile all open tabs**

Replace the body of `api.onVaultChanged` callback in `src/renderer/src/hooks/useVaultWatch.ts` with:

```ts
      const tree = await scanVaultWithSettings(root)
      useVaultStore.getState().setTree(tree)

      const openTabs = useDocumentStore.getState().tabs.map((tab) => tab.path)
      for (const openPath of openTabs) {
        const currentTab = useDocumentStore.getState().tabForPath(openPath)
        if (!currentTab) continue

        if (!pathExists(tree, openPath)) {
          window.alert(`打开的文件已在外部被删除：${openPath.split('/').pop() ?? openPath}`)
          useDocumentStore.getState().removePath(openPath)
          if (useDocumentStore.getState().activePath) {
            useVaultStore.getState().select(useDocumentStore.getState().activePath)
          } else {
            useVaultStore.getState().select(null)
          }
          continue
        }

        const disk = await api.readFile(openPath)
        const latest = useDocumentStore.getState().tabForPath(openPath)
        if (!latest) continue
        if (disk === latest.savedContent) continue
        if (latest.content === latest.savedContent) {
          useDocumentStore.getState().reloadFromDisk(openPath, disk)
        } else {
          useDocumentStore.getState().setConflict(openPath, disk)
        }
      }
```

Keep the existing imports and `pathExists` helper.

- [ ] **Step 7: Run save and draft tests and verify they pass**

Run:

```bash
npm run test -- test/saveDocument.test.ts test/useDraft.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit save/draft/watch changes**

```bash
git add src/renderer/src/lib/saveDocument.ts src/renderer/src/hooks/useDraft.ts src/renderer/src/hooks/useVaultWatch.ts test/saveDocument.test.ts test/useDraft.test.tsx
git commit -m "feat(document): save drafts and conflicts per tab"
```

## Task 3: Document Tabs Component

**Files:**
- Create: `src/renderer/src/components/DocumentTabs.tsx`
- Test: `test/documentTabs-dom.test.tsx`

- [ ] **Step 1: Create failing document tabs component tests**

Create `test/documentTabs-dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DocumentTabs } from '@/components/DocumentTabs'
import { useDocumentStore } from '@/stores/documentStore'

beforeEach(() => {
  useDocumentStore.getState().reset()
})

afterEach(cleanup)

describe('DocumentTabs', () => {
  it('renders one tab per open document and marks the active tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.openOrActivate('/v/b.md', 'b')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    expect(screen.getByRole('tab', { name: /a.md/ }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: /b.md/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('calls onActivate when a tab is clicked', () => {
    const onActivate = vi.fn()
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.openOrActivate('/v/b.md', 'b')
    render(<DocumentTabs onActivate={onActivate} onClose={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('tab', { name: /a.md/ }))
    expect(onActivate).toHaveBeenCalledWith('/v/a.md')
  })

  it('shows a dirty indicator for dirty tabs', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.setActiveContent('edited')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    expect(screen.getByLabelText('a.md 有未保存更改')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked without activating the tab button', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn(() => Promise.resolve())
    useDocumentStore.getState().openOrActivate('/v/a.md', 'a')
    render(<DocumentTabs onActivate={onActivate} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md' }))
    expect(onClose).toHaveBeenCalledWith('/v/a.md')
    expect(onActivate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npm run test -- test/documentTabs-dom.test.tsx
```

Expected: FAIL because `DocumentTabs` does not exist.

- [ ] **Step 3: Implement `DocumentTabs`**

Create `src/renderer/src/components/DocumentTabs.tsx`:

```tsx
import { X } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'

interface DocumentTabsProps {
  onActivate: (path: string) => void
  onClose: (path: string) => Promise<void>
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

export function DocumentTabs({ onActivate, onClose }: DocumentTabsProps): JSX.Element | null {
  const tabs = useDocumentStore((s) => s.tabs)
  const activePath = useDocumentStore((s) => s.activePath)

  if (tabs.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label="打开的文档"
      className="flex h-[34px] shrink-0 items-end gap-1 overflow-x-auto border-b border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-2 pt-1"
    >
      {tabs.map((tab) => {
        const name = fileName(tab.path)
        const active = tab.path === activePath
        const dirty = tab.content !== tab.savedContent
        return (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={active}
            title={tab.path}
            onClick={() => onActivate(tab.path)}
            className={[
              'group flex h-[28px] max-w-[220px] min-w-[92px] items-center gap-1.5 rounded-t-md border px-2 text-left text-[12px] transition-colors',
              active
                ? 'border-[color:var(--border-soft)] border-b-[color:var(--bg)] bg-[color:var(--bg)] text-foreground'
                : 'border-transparent bg-transparent text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]'
            ].join(' ')}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {dirty && (
              <span
                aria-label={`${name} 有未保存更改`}
                className="h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--accent)]"
              />
            )}
            <span
              role="button"
              aria-label={`关闭 ${name}`}
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                void onClose(tab.path)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                void onClose(tab.path)
              }}
              className="grid h-[18px] w-[18px] flex-none place-items-center rounded text-[color:var(--text-faint)] opacity-70 transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground group-hover:opacity-100"
            >
              <X size={12} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the document tabs test and verify it passes**

Run:

```bash
npm run test -- test/documentTabs-dom.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the component**

```bash
git add src/renderer/src/components/DocumentTabs.tsx test/documentTabs-dom.test.tsx
git commit -m "feat(ui): add document tab strip"
```

## Task 4: File Tree Toolbar

**Files:**
- Modify: `src/renderer/src/components/FileTree/Sidebar.tsx`
- Test: `test/fileTree-dom.test.tsx`

- [ ] **Step 1: Add sidebar toolbar tests**

Append these tests to `test/fileTree-dom.test.tsx`:

```tsx
import { Sidebar } from '@/components/FileTree/Sidebar'

describe('Sidebar toolbar', () => {
  it('renders toolbar actions in the approved order', () => {
    useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        onOpenFolder={() => {}}
        onOpenSearch={() => {}}
        onOpenToday={() => {}}
        onCollapse={() => {}}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )
    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(buttons.slice(0, 4)).toEqual(['打开文件夹', '搜索文件', '今日日程', '折叠文件树'])
  })

  it('disables search when no vault is open but keeps open-folder and collapse enabled', () => {
    useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
    render(
      <Sidebar
        width={260}
        scheduleEnabled={false}
        onOpenFolder={() => {}}
        onOpenSearch={() => {}}
        onOpenToday={() => {}}
        onCollapse={() => {}}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: '打开文件夹' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '搜索文件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '折叠文件树' })).not.toBeDisabled()
  })
})
```

- [ ] **Step 2: Run file tree tests and verify they fail**

Run:

```bash
npm run test -- test/fileTree-dom.test.tsx
```

Expected: FAIL because `Sidebar` does not accept toolbar props yet.

- [ ] **Step 3: Update `Sidebar.tsx` props and toolbar markup**

Replace `src/renderer/src/components/FileTree/Sidebar.tsx` with:

```tsx
import { memo } from 'react'
import { CalendarPlus, FolderOpen, PanelLeftClose, Search } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  width: number
  scheduleEnabled: boolean
  onOpenFolder: () => void
  onOpenSearch: () => void
  onOpenToday: () => void
  onCollapse: () => void
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

function toolbarButton(active = false): string {
  return [
    'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
    active
      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
      : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
  ].join(' ')
}

function SidebarInner({
  width,
  scheduleEnabled,
  onOpenFolder,
  onOpenSearch,
  onOpenToday,
  onCollapse,
  onOpenFile,
  onContextMenu
}: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)] pt-[42px]"
    >
      <div className="flex h-[34px] shrink-0 items-center justify-between px-3">
        <div className="flex gap-0.5">
          <button onClick={onOpenFolder} title="打开文件夹" aria-label="打开文件夹" className={toolbarButton()}>
            <FolderOpen size={16} />
          </button>
          <button
            onClick={onOpenSearch}
            disabled={!root}
            title="搜索文件 (⌘K)"
            aria-label="搜索文件"
            className={toolbarButton()}
          >
            <Search size={16} />
          </button>
          {scheduleEnabled && (
            <button onClick={onOpenToday} title="今日日程" aria-label="今日日程" className={toolbarButton()}>
              <CalendarPlus size={16} />
            </button>
          )}
          <button onClick={onCollapse} title="折叠文件树" aria-label="折叠文件树" className={toolbarButton()}>
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      {root ? (
        <>
          <div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[.08em] text-[color:var(--text-faint)] opacity-75">
            文件库
          </div>
          <FileTree onOpenFile={onOpenFile} onContextMenu={onContextMenu} filteredTree={null} />
        </>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-faint)]">
          打开文件夹开始浏览笔记
        </div>
      )}
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
```

- [ ] **Step 4: Run file tree tests and verify they pass**

Run:

```bash
npm run test -- test/fileTree-dom.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit toolbar changes**

```bash
git add src/renderer/src/components/FileTree/Sidebar.tsx test/fileTree-dom.test.tsx
git commit -m "feat(sidebar): move file actions into file tree toolbar"
```

## Task 5: Active-Tab Consumers and App Wiring

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/StatusBar.tsx`
- Modify: `src/renderer/src/components/DraftBanner.tsx`
- Modify: `src/renderer/src/components/ConflictBar.tsx`
- Modify: `src/renderer/src/components/OutlineDrawer.tsx`
- Modify: `src/renderer/src/components/BacklinksPanel.tsx`
- Test: `test/statusBar-dom.test.tsx`
- Test: `test/app-rerender.test.tsx`

- [ ] **Step 1: Update status bar tests for active-tab state**

In `test/statusBar-dom.test.tsx`, replace the `seed` helper with:

```ts
function seed(content: string, saveStatus: SaveStatus): void {
  useDocumentStore.getState().reset()
  useDocumentStore.getState().openOrActivate('/v/a.md', content)
  useDocumentStore.getState().markSaved(content, '/v/a.md')
  if (saveStatus === 'dirty') useDocumentStore.getState().setActiveContent(`${content} dirty`)
  if (saveStatus === 'saving') useDocumentStore.getState().markSaving('/v/a.md')
  if (saveStatus === 'error') useDocumentStore.getState().markError('/v/a.md')
}
```

In the "hides context label" test, call `useDocumentStore.getState().reset()` before rendering instead of `seed('', 'saved')`.

- [ ] **Step 2: Update active-tab consumers**

Make these exact component read changes:

In `src/renderer/src/components/StatusBar.tsx`:

```ts
const content = useDocumentStore((s) => s.content)
const saveStatus = useDocumentStore((s) => s.saveStatus)
```

These lines can stay because Task 1 preserves derived active fields.

In `src/renderer/src/components/OutlineDrawer.tsx`, keep the existing `content` selector because derived active fields preserve it.

In `src/renderer/src/components/BacklinksPanel.tsx`, keep `const currentPath = useDocumentStore((s) => s.path)` because derived active fields preserve it.

In `src/renderer/src/components/DraftBanner.tsx`, change draft actions to use the active path explicitly:

```ts
const pending = useDocumentStore((s) => s.pendingDraft)
const path = useDocumentStore((s) => s.path)
```

Then implement `discard` as:

```ts
  const discard = (): void => {
    const root = useVaultStore.getState().root
    if (path) useDocumentStore.getState().setPendingDraft(path, null)
    if (root && path) void api.deleteDraft(root, path).catch(() => {})
  }
```

And implement restore click as:

```tsx
onClick={() => {
  if (path) useDocumentStore.getState().applyDraft(path)
}}
```

In `src/renderer/src/components/ConflictBar.tsx`, read `path` and resolve by path:

```ts
const conflict = useDocumentStore((s) => s.conflict)
const path = useDocumentStore((s) => s.path)
```

Use:

```tsx
onClick={() => {
  if (path) useDocumentStore.getState().keepMine(path)
}}
```

and:

```tsx
onClick={() => {
  if (path) useDocumentStore.getState().takeDisk(path)
}}
```

- [ ] **Step 3: Wire App to tabs and sidebar toolbar**

In `src/renderer/src/App.tsx`:

1. Add import:

```ts
import { DocumentTabs } from '@/components/DocumentTabs'
```

2. Keep `PanelLeft` import and remove `CalendarPlus`, `FolderOpen`, and `Search` from the top-level lucide import if they are only used by `Sidebar`.

3. Replace `const path = useDocumentStore((s) => s.path)` and `const epoch = useDocumentStore((s) => s.epoch)` with:

```ts
  const path = useDocumentStore((s) => s.path)
  const epoch = useDocumentStore((s) => s.epoch)
  const tabs = useDocumentStore((s) => s.tabs)
```

4. Replace `openFileByPath` with:

```ts
  const openFileByPath = useCallback(async (filePath: string): Promise<void> => {
    const existing = useDocumentStore.getState().tabForPath(filePath)
    if (existing) {
      useDocumentStore.getState().setActivePath(filePath)
      useVaultStore.getState().select(filePath)
      return
    }

    const text = await api.readFile(filePath)
    useDocumentStore.getState().openOrActivate(filePath, text)
    useVaultStore.getState().select(filePath)
    const root = useVaultStore.getState().root
    if (root) {
      const draft = await api.readDraft(root, filePath).catch(() => null)
      if (draft != null && draft !== text && useDocumentStore.getState().tabForPath(filePath)) {
        useDocumentStore.getState().setPendingDraft(filePath, draft)
      }
    }
  }, [])
```

5. Add tab activation and close handlers above render:

```ts
  const handleActivateTab = useCallback((filePath: string): void => {
    useDocumentStore.getState().setActivePath(filePath)
    useVaultStore.getState().select(filePath)
  }, [])

  const handleCloseTab = useCallback(async (filePath: string): Promise<void> => {
    const tab = useDocumentStore.getState().tabForPath(filePath)
    if (!tab) return
    if (tab.conflict != null) {
      useDocumentStore.getState().setActivePath(filePath)
      useVaultStore.getState().select(filePath)
      return
    }
    if (tab.content !== tab.savedContent) {
      await saveDocument(api.writeFile, api.readFile, filePath)
      const after = useDocumentStore.getState().tabForPath(filePath)
      if (!after || after.content !== after.savedContent || after.saveStatus === 'error' || after.conflict != null) {
        useDocumentStore.getState().setActivePath(filePath)
        useVaultStore.getState().select(filePath)
        return
      }
    }
    useDocumentStore.getState().closeTab(filePath)
    useVaultStore.getState().select(useDocumentStore.getState().activePath)
  }, [])
```

6. Change `save()` to:

```ts
  function save(targetPath?: string): Promise<void> {
    return saveDocument(api.writeFile, api.readFile, targetPath)
  }
```

7. Change `handleChange` to:

```ts
  function handleChange(value: string): void {
    useDocumentStore.getState().setActiveContent(value)
    const currentPath = useDocumentStore.getState().activePath
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(currentPath ?? undefined), AUTOSAVE_MS)
  }
```

8. In rename and move handlers, replace direct `load(newPath, text)` with:

```ts
      useDocumentStore.getState().replacePath(node.path, newPath, text)
```

9. In trash handler, replace `reset()` with:

```ts
      useDocumentStore.getState().removePath(node.path)
      useVaultStore.getState().select(useDocumentStore.getState().activePath)
```

10. Pass toolbar props to `Sidebar`:

```tsx
          <Sidebar
            width={leftPaneWidth}
            scheduleEnabled={scheduleEnabled}
            onOpenFolder={handleOpenFolder}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenToday={() => void openSchedule(new Date())}
            onCollapse={() => setSidebarOpen(false)}
            onOpenFile={handleOpenFile}
            onContextMenu={handleContextMenu}
          />
```

11. Remove the old left titlebar button group. When `sidebarOpen` is false, render only the restore button:

```tsx
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="显示文件树 (⌘B)"
              aria-label="显示文件树"
              className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground [-webkit-app-region:no-drag]"
            >
              <PanelLeft size={16} />
            </button>
          )}
```

12. Render tabs above the editor body:

```tsx
          {tabs.length > 0 && (
            <DocumentTabs onActivate={handleActivateTab} onClose={handleCloseTab} />
          )}
```

Place it inside the main editor column before `<div className="flex min-h-0 flex-1">`.

13. Change editor save prop:

```tsx
                    onSave={() => void save(path)}
```

- [ ] **Step 4: Run status bar and app rerender tests**

Run:

```bash
npm run test -- test/statusBar-dom.test.tsx test/app-rerender.test.tsx
```

Expected: PASS after updating any test setup that still writes single-document fields directly.

- [ ] **Step 5: Commit App wiring**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/StatusBar.tsx src/renderer/src/components/DraftBanner.tsx src/renderer/src/components/ConflictBar.tsx src/renderer/src/components/OutlineDrawer.tsx src/renderer/src/components/BacklinksPanel.tsx test/statusBar-dom.test.tsx test/app-rerender.test.tsx
git commit -m "feat(app): wire document tabs into editor"
```

## Task 6: Full Verification and Fixups

**Files:**
- Modify only files touched by Tasks 1-5 when verification exposes type errors or broken assumptions.

- [ ] **Step 1: Run the focused tests**

Run:

```bash
npm run test -- test/documentStore.test.ts test/saveDocument.test.ts test/useDraft.test.tsx test/documentTabs-dom.test.tsx test/fileTree-dom.test.tsx test/statusBar-dom.test.tsx test/app-rerender.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript checks**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run renderer build**

Run:

```bash
npm run vite:build
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test in the app**

Run:

```bash
npm run dev
```

Expected manual results:

- File tree toolbar order is `打开文件夹`, `搜索`, `今日日程` when enabled, `折叠文件树`.
- Collapsing the sidebar leaves `显示文件树` in the titlebar.
- Opening two markdown files creates two tabs.
- Opening the first file again activates its existing tab.
- Editing one tab shows its dirty dot without marking the other tab dirty.
- Closing a dirty tab saves before removing it.
- A save error or conflict leaves the tab open and active.

- [ ] **Step 6: Commit verification fixups if any files changed**

If Step 1-5 required code changes, commit them:

```bash
git add src/renderer/src test
git commit -m "fix(tabs): complete tab integration verification"
```

If no files changed, do not create an empty commit.

## Self-Review

Spec coverage:

- File tree toolbar order and placement: Task 4 and Task 5.
- Sidebar restore control when collapsed: Task 5.
- True one-tab-per-path document model: Task 1.
- Tab UI under titlebar and above editor: Task 3 and Task 5.
- Open existing path activates existing tab: Task 1 and Task 5.
- Close dirty tab saves and blocks on conflict/error: Task 2 and Task 5.
- Per-tab drafts, saves, conflicts, and external changes: Task 2.
- No cross-restart restoration: no persistence is added in any task.

Placeholder scan:

- The plan contains no placeholder markers and no deferred unspecified work.
- Each test step includes exact test content or exact edits.
- Each verification step includes exact commands and expected results.

Type consistency:

- Store action names are consistent across tasks: `openOrActivate`, `setActivePath`, `setActiveContent`, `closeTab`, `replacePath`, `removePath`, `tabForPath`, `dirtyTabs`, `reloadFromDisk`.
- Path-aware save signature is consistently `saveDocument(writeFile, readFile?, targetPath?)`.
- UI props for `DocumentTabs` are consistently `onActivate` and `onClose`.
