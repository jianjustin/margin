# Margin M4 — File Tree Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file-tree sidebar: open a folder (vault), browse it as a tree, click to switch `.md` files, reload live on external changes, and do basic file CRUD (new note/folder, rename, trash) — all via main-process file I/O.

**Architecture:** Main process gains a recursive scanner, a debounced `fs.watch`, and CRUD ops; it exposes them over a typed IPC bridge plus a `vault:changed` push. The renderer holds a Zustand `vaultStore` (root/tree/expanded/selected, root persisted to localStorage) and a pure `flattenTree` that turns the tree + expanded-set into a flat list of visible rows. A `Sidebar`/`FileTree`/`FileTreeRow` component tree renders it; a `useVaultWatch` hook rescans and handles dirty-state reconciliation when the vault changes on disk. The renderer never touches `fs`.

**Tech Stack:** Electron 33 (`fs/promises`, `fs.watch`, `shell.trashItem`, `dialog`), React 18 + TS, Zustand, Vitest + jsdom.

---

## Context for the implementer

Work in `/Users/jianjustin/workspaces/margin`, an Electron + React + TS + CodeMirror 6 app. M0–M3 are done and pushed (HEAD `dcea221` or later). Read the M4 spec first: [docs/superpowers/specs/2026-05-31-margin-m4-file-tree-design.md](../specs/2026-05-31-margin-m4-file-tree-design.md).

Key facts:
- Node `v20.20.1`, Electron `33.4.11` (has `shell.trashItem`). Builds on `main`, no worktree.
- **This Bash environment mangles large/multiline stdout** — for verification, write command output to a temp file and Read the file; trust the git push refspec line.
- Vitest runs `test/**/*.test.ts` in node; DOM tests use a `// @vitest-environment jsdom` header (jsdom installed). `@` → `src/renderer/src`.
- Do NOT run `npm run dev` (blocking GUI); verify with `npm run typecheck`, `npx vitest run`, `npm run build`. The controller does GUI acceptance.
- The renderer NEVER imports `fs` — all file ops go through `window.margin` (preload bridge).

### Existing code you build on

`src/shared/ipc.ts` (current):
```ts
export const IPC = {
  dialogOpenFile: 'dialog:openFile',
  fileRead: 'file:read',
  fileWrite: 'file:write'
} as const

export interface MarginApi {
  openFile(): Promise<string | null>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
}
```

`src/main/index.ts` already has `registerIpcHandlers()` (open/read/write with try/catch) called inside `app.whenReady()`, then `createWindow()`. You extend these.

`src/preload/index.ts` exposes the three current methods on `window.margin`.

`src/renderer/src/stores/documentStore.ts` exposes: `path`, `content`, `savedContent`, `saveStatus: 'saved'|'saving'|'dirty'|'error'`, `isDirty()`, `load(path, content)`, `setContent`, `markSaving`, `markSaved`, `markError`. **There is no `reset()`** — Task 11 adds one.

`src/renderer/src/App.tsx` is a single-column shell: header (Open… button, filename, save-status, ThemeToggle) + main editor area. Task 7 turns it into a two-column layout (sidebar + editor).

`src/renderer/src/env.d.ts` declares `Window.margin: MarginApi` from `../../shared/ipc`.

### Mockup sidebar look (from `docs/design/margin/project/margin.css`, for Task 6 styling)

`.tree-row`: `display:flex; gap:6px; padding:4px 8px; border-radius:6px; font-size:13px; color:var(--text)`; hover `bg-hover`; chevron `.chev` width 12, `text-faint`, hidden on files; icon `.ticon` 17×17 mono 9.5px; `.ticon.fold`/`.ticon.f-md` = `var(--accent)` gold; folder name weight 600; active file = `bg:var(--accent-soft); border-color:var(--accent-line)`. Sidebar bg `var(--bg-panel)`, right border `var(--border-soft)`, width 244px.

### File map after M4

```
src/main/
├─ index.ts            MOD: register new handlers + watcher wiring
├─ vaultScanner.ts     NEW: scan(root) → TreeNode[]
├─ fileWatcher.ts      NEW: watchVault(root, onChange) debounced
└─ fsOps.ts            NEW: createNote / createFolder / renamePath / trashPath
src/shared/ipc.ts      MOD: channels + TreeNode + MarginApi extension
src/preload/index.ts   MOD: new methods + onVaultChanged subscription
src/renderer/src/
├─ stores/vaultStore.ts   NEW
├─ lib/flattenTree.ts     NEW (pure)
├─ hooks/useVaultWatch.ts NEW
├─ components/FileTree/
│  ├─ Sidebar.tsx
│  ├─ FileTree.tsx
│  ├─ FileTreeRow.tsx
│  └─ RowContextMenu.tsx
└─ App.tsx               MOD: two-column layout + open-folder wiring
test/
├─ vaultScanner.test.ts   NEW
├─ flattenTree.test.ts    NEW
├─ vaultStore.test.ts     NEW
└─ fileTree-dom.test.ts   NEW (jsdom)
```

### Shared types added in Task 1 (used everywhere after)

```ts
export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
}
```

---

# Milestone M4a — Scan + open folder over IPC

## Task 1: Extend the IPC contract (channels + TreeNode + MarginApi)

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Replace ipc.ts with the extended contract**

```ts
export const IPC = {
  dialogOpenFile: 'dialog:openFile',
  dialogOpenFolder: 'dialog:openFolder',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  vaultScan: 'vault:scan',
  fileCreate: 'file:create',
  folderCreate: 'folder:create',
  pathRename: 'path:rename',
  pathTrash: 'path:trash',
  vaultChanged: 'vault:changed'
} as const

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
}

export interface MarginApi {
  /** Show an open-file dialog; returns the chosen .md path, or null if cancelled. */
  openFile(): Promise<string | null>
  /** Show an open-folder dialog; returns the chosen directory, or null. */
  openFolder(): Promise<string | null>
  /** Read a UTF-8 file and return its contents. */
  readFile(path: string): Promise<string>
  /** Write UTF-8 content to a file. */
  writeFile(path: string, content: string): Promise<void>
  /** Recursively scan a folder into a tree (markdown files + folders, dotfiles skipped). */
  scanVault(root: string): Promise<TreeNode[]>
  /** Create a new markdown note in dir; returns the created absolute path. */
  createNote(dir: string, name: string): Promise<string>
  /** Create a new folder in dir; returns the created absolute path. */
  createFolder(dir: string, name: string): Promise<string>
  /** Rename a file/folder within its directory; returns the new absolute path. */
  renamePath(oldPath: string, newName: string): Promise<string>
  /** Move a file/folder to the OS trash. */
  trashPath(path: string): Promise<void>
  /** Subscribe to vault-changed pushes; returns an unsubscribe function. */
  onVaultChanged(callback: (root: string) => void): () => void
}
```

---

## Task 2: vaultScanner (TDD)

**Files:**
- Create: `src/main/vaultScanner.ts`
- Test: `test/vaultScanner.test.ts`

- [ ] **Step 1: Write the failing test**

`test/vaultScanner.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanVault } from '../src/main/vaultScanner'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'margin-scan-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanVault', () => {
  it('includes markdown files and folders, folders first then files, alpha sorted', () => {
    writeFileSync(join(root, 'beta.md'), '')
    writeFileSync(join(root, 'alpha.md'), '')
    mkdirSync(join(root, 'zfolder'))
    mkdirSync(join(root, 'afolder'))
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['afolder', 'zfolder', 'alpha.md', 'beta.md'])
    expect(tree[0].type).toBe('folder')
    expect(tree[2].type).toBe('file')
  })

  it('skips dotfiles and dot-directories', () => {
    writeFileSync(join(root, 'note.md'), '')
    writeFileSync(join(root, '.hidden.md'), '')
    mkdirSync(join(root, '.obsidian'))
    writeFileSync(join(root, '.obsidian', 'config.md'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['note.md'])
  })

  it('skips non-markdown files', () => {
    writeFileSync(join(root, 'keep.md'), '')
    writeFileSync(join(root, 'skip.txt'), '')
    writeFileSync(join(root, 'skip.png'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['keep.md'])
  })

  it('recurses into subfolders with correct nesting and absolute paths', () => {
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'inner.md'), '')
    const tree = scanVault(root)
    expect(tree[0].name).toBe('sub')
    expect(tree[0].children?.[0].name).toBe('inner.md')
    expect(tree[0].children?.[0].path).toBe(join(root, 'sub', 'inner.md'))
  })

  it('keeps empty folders', () => {
    mkdirSync(join(root, 'empty'))
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['empty'])
    expect(tree[0].children).toEqual([])
  })

  it('accepts .markdown extension too', () => {
    writeFileSync(join(root, 'a.markdown'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['a.markdown'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- vaultScanner`
Expected: FAIL — cannot resolve `../src/main/vaultScanner`.

- [ ] **Step 3: Implement vaultScanner.ts**

```ts
import { readdirSync } from 'fs'
import { join } from 'path'
import type { TreeNode } from '../shared/ipc'

const MD_EXT = /\.(md|markdown)$/i

/**
 * Recursively scan `root` into a TreeNode[]: folders (incl. empty) + markdown
 * files. Dotfiles/dot-directories are skipped. Each level is sorted folders-
 * first, then files, each group alphabetical (locale-aware). Pure read-only;
 * unreadable entries are skipped rather than throwing the whole scan.
 */
export function scanVault(root: string): TreeNode[] {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }

  const folders: TreeNode[] = []
  const files: TreeNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path, type: 'folder', children: scanVault(path) })
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      files.push({ name: entry.name, path, type: 'file' })
    }
  }

  const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name)
  folders.sort(byName)
  files.sort(byName)
  return [...folders, ...files]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- vaultScanner`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/vaultScanner.ts test/vaultScanner.test.ts
git commit -m "feat(vault): recursive markdown scanner + IPC contract extension (TDD)"
```

---

## Task 3: Main handlers for openFolder + scan; preload exposes them

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the openFolder + scan handlers in main**

In `src/main/index.ts`, update the imports at the top:
```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '../shared/ipc'
import { scanVault } from './vaultScanner'
```
Then inside `registerIpcHandlers()`, after the existing `fileWrite` handler, add:
```ts
  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.vaultScan, (_event, root: string) => scanVault(root))
```

- [ ] **Step 2: Expose them in preload**

In `src/preload/index.ts`, add to the `api` object (after `writeFile`):
```ts
  openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
  scanVault: (root) => ipcRenderer.invoke(IPC.vaultScan, root),
```
(The remaining MarginApi methods — createNote/createFolder/renamePath/trashPath/onVaultChanged — are added in later tasks; TypeScript will flag the `api` object as not fully implementing `MarginApi` until then. To keep the build green between tasks, add the rest as stubs now:)
```ts
  createNote: (dir, name) => ipcRenderer.invoke(IPC.fileCreate, dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke(IPC.folderCreate, dir, name),
  renamePath: (oldPath, newName) => ipcRenderer.invoke(IPC.pathRename, oldPath, newName),
  trashPath: (path) => ipcRenderer.invoke(IPC.pathTrash, path),
  onVaultChanged: (callback) => {
    const listener = (_e: unknown, root: string): void => callback(root)
    ipcRenderer.on(IPC.vaultChanged, listener)
    return () => ipcRenderer.removeListener(IPC.vaultChanged, listener)
  }
```

> The renderer-side handlers in main for fileCreate/folderCreate/pathRename/pathTrash land in
> Task 10, and the watcher push in Task 8. Calling them before then would reject, but nothing
> calls them yet — the UI wiring arrives with each feature.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck > /tmp/m4a3.txt 2>&1; echo "tc=$?" >> /tmp/m4a3.txt
```
Read `/tmp/m4a3.txt`; expect `tc=0`.
```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(vault): openFolder + scan IPC handlers; preload bridge for vault API"
```

---

# Milestone M4b — Sidebar UI + browse + switch

## Task 4: flattenTree pure function (TDD)

**Files:**
- Create: `src/renderer/src/lib/flattenTree.ts`
- Test: `test/flattenTree.test.ts`

- [ ] **Step 1: Write the failing test**

`test/flattenTree.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { flattenTree } from '@/lib/flattenTree'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [
      { name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' }
    ]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

describe('flattenTree', () => {
  it('shows top level and hides collapsed folder children', () => {
    const rows = flattenTree(tree, new Set())
    expect(rows.map((r) => r.node.name)).toEqual(['folderA', 'root.md'])
    expect(rows.map((r) => r.depth)).toEqual([0, 0])
  })

  it('reveals children when the folder is expanded', () => {
    const rows = flattenTree(tree, new Set(['/v/folderA']))
    expect(rows.map((r) => r.node.name)).toEqual(['folderA', 'inner.md', 'root.md'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- flattenTree`
Expected: FAIL — cannot resolve `@/lib/flattenTree`.

- [ ] **Step 3: Implement flattenTree.ts**

```ts
import type { TreeNode } from '../../../shared/ipc'

export interface FlatRow {
  node: TreeNode
  depth: number
}

/** Flatten a tree into the list of currently-visible rows (collapsed folders hide children). */
export function flattenTree(nodes: TreeNode[], expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = []
  const walk = (list: TreeNode[], depth: number): void => {
    for (const node of list) {
      rows.push({ node, depth })
      if (node.type === 'folder' && node.children && expanded.has(node.path)) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return rows
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- flattenTree`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/flattenTree.ts test/flattenTree.test.ts
git commit -m "feat(vault): flattenTree pure helper (visible rows) — TDD"
```

---

## Task 5: vaultStore (TDD)

**Files:**
- Create: `src/renderer/src/stores/vaultStore.ts`
- Test: `test/vaultStore.test.ts`

- [ ] **Step 1: Write the failing test**

`test/vaultStore.test.ts`:
```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [{ name: 'a.md', path: '/v/a.md', type: 'file' }]
const tree2: TreeNode[] = [{ name: 'b.md', path: '/v/b.md', type: 'file' }]

beforeEach(() => {
  localStorage.clear()
  useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
})

describe('vaultStore', () => {
  it('openRoot sets root + tree and persists root', () => {
    useVaultStore.getState().openRoot('/v', tree)
    expect(useVaultStore.getState().root).toBe('/v')
    expect(useVaultStore.getState().tree).toEqual(tree)
    expect(localStorage.getItem('margin.vaultRoot')).toBe('/v')
  })

  it('setTree replaces the tree but keeps expanded + selected', () => {
    useVaultStore.getState().openRoot('/v', tree)
    useVaultStore.getState().toggleExpanded('/v/folder')
    useVaultStore.getState().select('/v/a.md')
    useVaultStore.getState().setTree(tree2)
    const s = useVaultStore.getState()
    expect(s.tree).toEqual(tree2)
    expect(s.expanded.has('/v/folder')).toBe(true)
    expect(s.selectedPath).toBe('/v/a.md')
  })

  it('toggleExpanded adds then removes a path', () => {
    useVaultStore.getState().toggleExpanded('/v/f')
    expect(useVaultStore.getState().expanded.has('/v/f')).toBe(true)
    useVaultStore.getState().toggleExpanded('/v/f')
    expect(useVaultStore.getState().expanded.has('/v/f')).toBe(false)
  })

  it('select sets selectedPath', () => {
    useVaultStore.getState().select('/v/a.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/a.md')
  })

  it('closeVault clears everything and the persisted root', () => {
    useVaultStore.getState().openRoot('/v', tree)
    useVaultStore.getState().closeVault()
    expect(useVaultStore.getState().root).toBeNull()
    expect(localStorage.getItem('margin.vaultRoot')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- vaultStore`
Expected: FAIL — cannot resolve `@/stores/vaultStore`.

- [ ] **Step 3: Implement vaultStore.ts**

```ts
import { create } from 'zustand'
import type { TreeNode } from '../../../shared/ipc'

const ROOT_KEY = 'margin.vaultRoot'

function persistRoot(root: string | null): void {
  try {
    if (root) localStorage.setItem(ROOT_KEY, root)
    else localStorage.removeItem(ROOT_KEY)
  } catch {
    // ignore persistence failure
  }
}

/** The persisted last-opened vault root, or null. */
export function loadPersistedRoot(): string | null {
  try {
    return localStorage.getItem(ROOT_KEY)
  } catch {
    return null
  }
}

interface VaultState {
  root: string | null
  tree: TreeNode[]
  expanded: Set<string>
  selectedPath: string | null
  openRoot(root: string, tree: TreeNode[]): void
  setTree(tree: TreeNode[]): void
  toggleExpanded(path: string): void
  select(path: string): void
  closeVault(): void
}

export const useVaultStore = create<VaultState>((set) => ({
  root: null,
  tree: [],
  expanded: new Set(),
  selectedPath: null,
  openRoot: (root, tree) => {
    persistRoot(root)
    set({ root, tree })
  },
  setTree: (tree) => set({ tree }),
  toggleExpanded: (path) =>
    set((state) => {
      const expanded = new Set(state.expanded)
      if (expanded.has(path)) expanded.delete(path)
      else expanded.add(path)
      return { expanded }
    }),
  select: (path) => set({ selectedPath: path }),
  closeVault: () => {
    persistRoot(null)
    set({ root: null, tree: [], expanded: new Set(), selectedPath: null })
  }
}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- vaultStore`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/vaultStore.ts test/vaultStore.test.ts
git commit -m "feat(vault): vaultStore (root/tree/expanded/selected, persisted) — TDD"
```

---

## Task 6: FileTreeRow + FileTree components

**Files:**
- Create: `src/renderer/src/components/FileTree/FileTreeRow.tsx`
- Create: `src/renderer/src/components/FileTree/FileTree.tsx`

- [ ] **Step 1: Create FileTreeRow.tsx**

```tsx
import { ChevronRight, FileText, Folder } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'

interface FileTreeRowProps {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  onSelect: (node: TreeNode) => void
  onToggle: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

export function FileTreeRow({
  node,
  depth,
  expanded,
  selected,
  onSelect,
  onToggle,
  onContextMenu
}: FileTreeRowProps): JSX.Element {
  const isFolder = node.type === 'folder'

  const handleClick = (): void => {
    if (isFolder) onToggle(node)
    else onSelect(node)
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(node, e.clientX, e.clientY)
      }}
      title={node.name}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={[
        'flex h-[26px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[13px]',
        selected
          ? 'border border-[color:var(--accent-line)] bg-[color:var(--accent-soft)] text-foreground'
          : 'border border-transparent text-foreground hover:bg-[color:var(--bg-hover)]'
      ].join(' ')}
    >
      <span className="grid w-3 flex-none place-items-center text-[color:var(--text-faint)]">
        {isFolder ? (
          <ChevronRight
            size={12}
            className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
        ) : null}
      </span>
      <span className="grid h-[17px] w-[17px] flex-none place-items-center text-[color:var(--accent)]">
        {isFolder ? <Folder size={15} /> : <FileText size={14} />}
      </span>
      <span className={`flex-1 truncate ${isFolder ? 'font-semibold' : ''}`}>{node.name}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create FileTree.tsx**

```tsx
import { useVaultStore } from '@/stores/vaultStore'
import { flattenTree } from '@/lib/flattenTree'
import type { TreeNode } from '../../../../shared/ipc'
import { FileTreeRow } from './FileTreeRow'

interface FileTreeProps {
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

export function FileTree({ onOpenFile, onContextMenu }: FileTreeProps): JSX.Element {
  const tree = useVaultStore((s) => s.tree)
  const expanded = useVaultStore((s) => s.expanded)
  const selectedPath = useVaultStore((s) => s.selectedPath)
  const toggleExpanded = useVaultStore((s) => s.toggleExpanded)

  const rows = flattenTree(tree, expanded)

  if (rows.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-[color:var(--text-faint)]">Empty folder</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      {rows.map(({ node, depth }) => (
        <FileTreeRow
          key={node.path}
          node={node}
          depth={depth}
          expanded={expanded.has(node.path)}
          selected={selectedPath === node.path}
          onSelect={onOpenFile}
          onToggle={(n) => toggleExpanded(n.path)}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck > /tmp/m4b6.txt 2>&1; echo "tc=$?" >> /tmp/m4b6.txt` then Read `/tmp/m4b6.txt`; expect `tc=0`.
(`RowContextMenu` is wired in Task 10; for now `onContextMenu` is just plumbed through.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FileTree/FileTreeRow.tsx src/renderer/src/components/FileTree/FileTree.tsx
git commit -m "feat(vault): FileTree + FileTreeRow components (Bear sidebar look)"
```

---

## Task 7: Sidebar + two-column layout + open-folder wiring

**Files:**
- Create: `src/renderer/src/components/FileTree/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
import { FolderOpen } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  onOpenFolder: () => void
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

export function Sidebar({ onOpenFolder, onOpenFile, onContextMenu }: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const rootName = root ? root.split('/').pop() : null

  return (
    <aside className="flex h-full w-[244px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <span className="truncate text-sm font-semibold tracking-wide">{rootName ?? 'Margin'}</span>
        <button
          onClick={onOpenFolder}
          title="Open folder"
          aria-label="Open folder"
          className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <FolderOpen size={16} />
        </button>
      </div>
      {root ? (
        <FileTree onOpenFile={onOpenFile} onContextMenu={onContextMenu} />
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-faint)]">
          Open a folder to browse your notes
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Rewrite App.tsx for the two-column layout**

Replace the entire contents of `src/renderer/src/App.tsx` with:
```tsx
import { useEffect, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Editor } from '@/components/Editor'
import { saveDocument } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
import type { TreeNode } from '../../shared/ipc'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  }, [themeMode, systemDark])

  // Reopen the last vault on launch.
  useEffect(() => {
    const saved = loadPersistedRoot()
    if (!saved) return
    void window.margin
      .scanVault(saved)
      .then((tree) => useVaultStore.getState().openRoot(saved, tree))
      .catch(() => useVaultStore.getState().closeVault())
  }, [])

  async function openFolder(): Promise<void> {
    const chosen = await window.margin.openFolder()
    if (!chosen) return
    const tree = await window.margin.scanVault(chosen)
    useVaultStore.getState().openRoot(chosen, tree)
  }

  async function openFileByPath(filePath: string): Promise<void> {
    const text = await window.margin.readFile(filePath)
    useDocumentStore.getState().load(filePath, text)
    useVaultStore.getState().select(filePath)
  }

  async function openFileDialog(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    await openFileByPath(chosen)
  }

  function save(): Promise<void> {
    return saveDocument(window.margin.writeFile)
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Context menu is implemented in a later task; no-op for now.
  function handleContextMenu(_node: TreeNode, _x: number, _y: number): void {}

  const fileName = path ? path.split('/').pop() : 'No file open'

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 pl-20 text-sm text-muted-foreground">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="grid h-[26px] w-[30px] place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={() => void openFileDialog()}
          className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground hover:bg-accent"
        >
          Open…
        </button>
        <span className="truncate">{fileName}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs ${saveStatus === 'error' ? 'text-destructive' : ''}`}>
            {saveStatus === 'saved'
              ? 'Saved'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'error'
                  ? 'Save failed — retrying on next edit'
                  : 'Unsaved'}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            onOpenFolder={() => void openFolder()}
            onOpenFile={(node) => void openFileByPath(node.path)}
            onContextMenu={handleContextMenu}
          />
        )}
        <main className="min-h-0 min-w-0 flex-1">
          {path ? (
            <Editor
              docKey={path}
              initialValue={content}
              onChange={handleChange}
              onSave={() => void save()}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Open a folder or file to start editing
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck > /tmp/m4b7.txt 2>&1; echo "tc=$?" >> /tmp/m4b7.txt
npm run build >> /tmp/m4b7.txt 2>&1; echo "build=$?" >> /tmp/m4b7.txt
```
Read `/tmp/m4b7.txt`; expect `tc=0`, `build=0`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FileTree/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat(vault): sidebar + two-column layout + open-folder/switch + reopen last vault"
```

---

# Milestone M4c — Live external-change reload

## Task 8: fileWatcher + vault:changed push

**Files:**
- Create: `src/main/fileWatcher.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create fileWatcher.ts**

```ts
import { watch, type FSWatcher } from 'fs'

/**
 * Watch a vault root recursively and invoke `onChange` (debounced) on any
 * file-system event under it. Returns a stop function. macOS `fs.watch`
 * supports `recursive: true`.
 */
export function watchVault(root: string, onChange: () => void, debounceMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null

  try {
    watcher = watch(root, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    })
  } catch {
    // If watching fails (e.g. permissions), the app still works without live reload.
    watcher = null
  }

  return () => {
    if (timer) clearTimeout(timer)
    watcher?.close()
  }
}
```

- [ ] **Step 2: Wire the watcher into main, re-armed per opened vault**

In `src/main/index.ts`, update imports:
```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '../shared/ipc'
import { scanVault } from './vaultScanner'
import { watchVault } from './fileWatcher'
```
Add a module-level watcher handle and a helper, above `registerIpcHandlers`:
```ts
let stopWatch: (() => void) | null = null

function armWatcher(win: BrowserWindow, root: string): void {
  stopWatch?.()
  stopWatch = watchVault(root, () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.vaultChanged, root)
  })
}
```
Change the scan handler so opening/scanning a vault also arms the watcher. Replace:
```ts
  ipcMain.handle(IPC.vaultScan, (_event, root: string) => scanVault(root))
```
with:
```ts
  ipcMain.handle(IPC.vaultScan, (event, root: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) armWatcher(win, root)
    return scanVault(root)
  })
```
And stop the watcher on quit — add after the existing `window-all-closed` handler:
```ts
app.on('will-quit', () => {
  stopWatch?.()
})
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck > /tmp/m4c8.txt 2>&1; echo "tc=$?" >> /tmp/m4c8.txt
```
Read `/tmp/m4c8.txt`; expect `tc=0`.
```bash
git add src/main/fileWatcher.ts src/main/index.ts
git commit -m "feat(vault): debounced recursive fs.watch + vault:changed push"
```

---

## Task 9: useVaultWatch hook — rescan + dirty-aware reload

**Files:**
- Create: `src/renderer/src/hooks/useVaultWatch.ts`
- Modify: `src/renderer/src/stores/documentStore.ts` (add `reset()`)
- Modify: `src/renderer/src/App.tsx` (use the hook)

- [ ] **Step 1: Add a `reset()` to documentStore**

In `src/renderer/src/stores/documentStore.ts`, add `reset` to the interface (after `markError`):
```ts
  markError(): void
  reset(): void
```
and to the store implementation (after `markError: ...`):
```ts
  markError: () => set({ saveStatus: 'error' }),
  reset: () => set({ path: null, content: '', savedContent: '', saveStatus: 'saved' }),
```
(Leave the existing `saveDocument` line at the end of the store untouched.)

- [ ] **Step 2: Create useVaultWatch.ts**

```tsx
import { useEffect } from 'react'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'

/** Type guard: does a path still exist anywhere in the tree? */
function pathExists(nodes: import('../../../shared/ipc').TreeNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.path === target) return true
    if (n.children && pathExists(n.children, target)) return true
  }
  return false
}

/**
 * Subscribe to vault-changed pushes: rescan the tree, then reconcile the open
 * document — silently reload if clean, prompt if dirty, close if deleted.
 */
export function useVaultWatch(): void {
  useEffect(() => {
    const unsubscribe = window.margin.onVaultChanged(async (root) => {
      const tree = await window.margin.scanVault(root)
      useVaultStore.getState().setTree(tree)

      const doc = useDocumentStore.getState()
      const openPath = doc.path
      if (!openPath) return

      // Open file was deleted externally.
      if (!pathExists(tree, openPath)) {
        window.alert('The open file was deleted outside Margin.')
        doc.reset()
        useVaultStore.getState().select('')
        return
      }

      // Re-read; if disk differs from what we have saved, reconcile.
      const disk = await window.margin.readFile(openPath)
      if (disk === doc.savedContent) return // no real change for us
      if (!doc.isDirty()) {
        doc.load(openPath, disk) // clean → silently adopt disk
      } else {
        const takeDisk = window.confirm(
          'This file changed outside Margin.\n\nOK = load the disk version (discard your edits)\nCancel = keep your version'
        )
        if (takeDisk) doc.load(openPath, disk)
      }
    })
    return unsubscribe
  }, [])
}
```

- [ ] **Step 3: Use the hook in App**

In `src/renderer/src/App.tsx`, add the import:
```tsx
import { useVaultWatch } from '@/hooks/useVaultWatch'
```
and call it near the top of the `App` component body (after the theme hooks):
```tsx
  useVaultWatch()
```

- [ ] **Step 4: Typecheck + build + commit**

```bash
npm run typecheck > /tmp/m4c9.txt 2>&1; echo "tc=$?" >> /tmp/m4c9.txt
npx vitest run >> /tmp/m4c9.txt 2>&1
npm run build >> /tmp/m4c9.txt 2>&1; echo "build=$?" >> /tmp/m4c9.txt
```
Read `/tmp/m4c9.txt`; expect `tc=0`, all tests pass, `build=0`.
```bash
git add src/renderer/src/hooks/useVaultWatch.ts src/renderer/src/stores/documentStore.ts src/renderer/src/App.tsx
git commit -m "feat(vault): live reload on external changes (rescan + dirty-aware reconcile)"
```

---

# Milestone M4d — File CRUD

## Task 10: fsOps + CRUD handlers + preload (already stubbed)

**Files:**
- Create: `src/main/fsOps.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create fsOps.ts**

```ts
import { mkdir, rename, writeFile, access } from 'fs/promises'
import { join, dirname, extname } from 'path'
import { shell } from 'electron'

/** Find a non-colliding path by appending -1, -2, … before the extension. */
async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let candidate = join(dir, name)
  let n = 1
  for (;;) {
    try {
      await access(candidate)
      candidate = join(dir, `${base}-${n}${ext}`)
      n += 1
    } catch {
      return candidate // does not exist → free to use
    }
  }
}

function assertSafeName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) {
    throw new Error('Invalid name')
  }
}

/** Create a new markdown note in `dir`; `.md` is appended if missing. Returns the path. */
export async function createNote(dir: string, name: string): Promise<string> {
  assertSafeName(name)
  const fileName = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`
  const path = await uniquePath(dir, fileName)
  await writeFile(path, '', 'utf-8')
  return path
}

/** Create a new folder in `dir`. Returns the path. */
export async function createFolder(dir: string, name: string): Promise<string> {
  assertSafeName(name)
  const path = await uniquePath(dir, name)
  await mkdir(path, { recursive: false })
  return path
}

/** Rename a file/folder within its directory. Returns the new path. */
export async function renamePath(oldPath: string, newName: string): Promise<string> {
  assertSafeName(newName)
  const dir = dirname(oldPath)
  // Preserve a markdown extension if the original had one and the new name lacks it.
  const hadMd = /\.(md|markdown)$/i.test(oldPath)
  const finalName = hadMd && !/\.(md|markdown)$/i.test(newName) ? `${newName}.md` : newName
  const newPath = join(dir, finalName)
  await rename(oldPath, newPath)
  return newPath
}

/** Move a file/folder to the OS trash (never a hard delete). */
export async function trashPath(path: string): Promise<void> {
  await shell.trashItem(path)
}
```

- [ ] **Step 2: Register the CRUD handlers in main**

In `src/main/index.ts`, add to imports:
```ts
import { createNote, createFolder, renamePath, trashPath } from './fsOps'
```
Inside `registerIpcHandlers()`, after the `vaultScan` handler, add:
```ts
  ipcMain.handle(IPC.fileCreate, (_e, dir: string, name: string) => createNote(dir, name))
  ipcMain.handle(IPC.folderCreate, (_e, dir: string, name: string) => createFolder(dir, name))
  ipcMain.handle(IPC.pathRename, (_e, oldPath: string, newName: string) =>
    renamePath(oldPath, newName)
  )
  ipcMain.handle(IPC.pathTrash, (_e, path: string) => trashPath(path))
```
(The preload bridge for these was already added in Task 3 Step 2.)

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck > /tmp/m4d10.txt 2>&1; echo "tc=$?" >> /tmp/m4d10.txt
```
Read `/tmp/m4d10.txt`; expect `tc=0`.
```bash
git add src/main/fsOps.ts src/main/index.ts
git commit -m "feat(vault): file CRUD ops (create note/folder, rename, trash) + handlers"
```

---

## Task 11: RowContextMenu + CRUD wiring in App

**Files:**
- Create: `src/renderer/src/components/FileTree/RowContextMenu.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create RowContextMenu.tsx**

```tsx
import { useEffect } from 'react'
import type { TreeNode } from '../../../../shared/ipc'

export interface ContextMenuState {
  node: TreeNode
  x: number
  y: number
}

interface RowContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
  onNewNote: (folder: TreeNode) => void
  onNewFolder: (folder: TreeNode) => void
  onRename: (node: TreeNode) => void
  onTrash: (node: TreeNode) => void
}

export function RowContextMenu({
  menu,
  onClose,
  onNewNote,
  onNewFolder,
  onRename,
  onTrash
}: RowContextMenuProps): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [onClose])

  const isFolder = menu.node.type === 'folder'
  const item =
    'block w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[color:var(--bg-hover)]'

  return (
    <div
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-50 min-w-[160px] rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev)] py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {isFolder && (
        <>
          <button className={item} onClick={() => onNewNote(menu.node)}>New note</button>
          <button className={item} onClick={() => onNewFolder(menu.node)}>New folder</button>
        </>
      )}
      <button className={item} onClick={() => onRename(menu.node)}>Rename…</button>
      <button className={item} onClick={() => onTrash(menu.node)}>Move to Trash</button>
    </div>
  )
}
```

> CRUD prompts use `window.prompt`/`window.confirm` for M4 (minimal, no new component). A polished
> inline-rename input is a later refinement; YAGNI for now.

- [ ] **Step 2: Wire CRUD into App.tsx**

In `src/renderer/src/App.tsx`:

Add imports:
```tsx
import { RowContextMenu, type ContextMenuState } from '@/components/FileTree/RowContextMenu'
```

Add menu state near the other `useState` (after `sidebarOpen`):
```tsx
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
```

Replace the no-op `handleContextMenu` with:
```tsx
  function handleContextMenu(node: TreeNode, x: number, y: number): void {
    setMenu({ node, x, y })
  }

  async function refreshTree(): Promise<void> {
    const root = useVaultStore.getState().root
    if (!root) return
    const tree = await window.margin.scanVault(root)
    useVaultStore.getState().setTree(tree)
  }

  function targetDir(node: TreeNode): string {
    return node.type === 'folder' ? node.path : node.path.replace(/\/[^/]+$/, '')
  }

  async function newNote(folder: TreeNode): Promise<void> {
    const name = window.prompt('New note name:')
    if (!name) return
    const created = await window.margin.createNote(targetDir(folder), name)
    await refreshTree()
    await openFileByPath(created)
  }

  async function newFolder(folder: TreeNode): Promise<void> {
    const name = window.prompt('New folder name:')
    if (!name) return
    await window.margin.createFolder(targetDir(folder), name)
    await refreshTree()
  }

  async function renameNode(node: TreeNode): Promise<void> {
    const name = window.prompt('Rename to:', node.name)
    if (!name || name === node.name) return
    const newPath = await window.margin.renamePath(node.path, name)
    await refreshTree()
    if (useDocumentStore.getState().path === node.path) {
      const text = await window.margin.readFile(newPath)
      useDocumentStore.getState().load(newPath, text)
      useVaultStore.getState().select(newPath)
    }
  }

  async function trashNode(node: TreeNode): Promise<void> {
    if (!window.confirm(`Move "${node.name}" to Trash?`)) return
    await window.margin.trashPath(node.path)
    if (useDocumentStore.getState().path === node.path) {
      useDocumentStore.getState().reset()
    }
    await refreshTree()
  }
```

Render the menu just before the closing `</div>` of the outermost container (after the
`<div className="flex min-h-0 flex-1">…</div>` block):
```tsx
      {menu && (
        <RowContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewNote={(n) => {
            setMenu(null)
            void newNote(n)
          }}
          onNewFolder={(n) => {
            setMenu(null)
            void newFolder(n)
          }}
          onRename={(n) => {
            setMenu(null)
            void renameNode(n)
          }}
          onTrash={(n) => {
            setMenu(null)
            void trashNode(n)
          }}
        />
      )}
```

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck > /tmp/m4d11.txt 2>&1; echo "tc=$?" >> /tmp/m4d11.txt
npm run build >> /tmp/m4d11.txt 2>&1; echo "build=$?" >> /tmp/m4d11.txt
```
Read `/tmp/m4d11.txt`; expect `tc=0`, `build=0`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FileTree/RowContextMenu.tsx src/renderer/src/App.tsx
git commit -m "feat(vault): right-click CRUD (new note/folder, rename, trash) wired in"
```

---

## Task 12: DOM smoke test for the sidebar

**Files:**
- Test: `test/fileTree-dom.test.ts`

- [ ] **Step 1: Write the test**

`test/fileTree-dom.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { FileTree } from '@/components/FileTree/FileTree'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [{ name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' }]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

beforeEach(() => {
  useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
})
afterEach(cleanup)

describe('FileTree', () => {
  it('renders top-level rows and hides collapsed children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    expect(screen.getByText('folderA')).toBeTruthy()
    expect(screen.getByText('root.md')).toBeTruthy()
    expect(screen.queryByText('inner.md')).toBeNull()
  })

  it('calls onOpenFile when a file row is clicked', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('root.md'))
    expect(onOpenFile).toHaveBeenCalledOnce()
  })

  it('expands a folder on click to reveal children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('folderA'))
    expect(screen.getByText('inner.md')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ensure the test deps exist**

`@testing-library/react` and `@testing-library/dom` may not be installed. Check and install if missing:
```bash
node -e "require.resolve('@testing-library/react')" > /tmp/rtl.txt 2>&1; echo "exit=$?" >> /tmp/rtl.txt
```
Read `/tmp/rtl.txt`. If `exit` is non-zero, run:
```bash
npm install -D @testing-library/react@^16 @testing-library/dom@^10
```

- [ ] **Step 3: Run the test**

Run: `npm test -- fileTree-dom`
Expected: 3 tests PASS. (If RTL setup needs `globals`, vitest.config already sets `globals: true`; jsdom env is set by the file header.)

- [ ] **Step 4: Commit**

```bash
git add test/fileTree-dom.test.ts package.json package-lock.json
git commit -m "test(vault): DOM smoke test for FileTree (render/click/expand)"
```

---

## Task 13: Full verification + manual GUI acceptance + push

**Files:** none

- [ ] **Step 1: Headless full check**

```bash
npm run typecheck > /tmp/m4final.txt 2>&1; echo "tc=$?" >> /tmp/m4final.txt
npx vitest run >> /tmp/m4final.txt 2>&1
npm run build >> /tmp/m4final.txt 2>&1; echo "build=$?" >> /tmp/m4final.txt
```
Read `/tmp/m4final.txt`. Expected: `tc=0`, all tests pass, `build=0`.

- [ ] **Step 2: Manual GUI acceptance (controller or user)**

Launch `npm run dev`, then:
1. Click the folder icon in the sidebar → pick a real vault folder → tree appears (folders first, dotfiles hidden).
2. Expand/collapse folders (chevron rotates); click a `.md` → it opens in the editor and the row shows the active (gold) state.
3. Quit and relaunch → the same vault reopens automatically.
4. In Finder, add/rename/delete a `.md` in the vault → the tree updates within ~0.3s.
5. With a clean open file, edit it in another app → Margin silently reloads. With unsaved edits, the same triggers the keep/load prompt. Delete the open file externally → Margin warns and clears the editor.
6. Right-click a folder → New note / New folder; right-click a file → Rename / Move to Trash. Deleted files land in the system Trash (not gone).

> GUI automation does not work in this environment (screencapture misses the Electron window;
> dialogs are native), so Step 2 is a human/controller eyeball check.

- [ ] **Step 3: Push**

```bash
git push origin main > /tmp/m4push.txt 2>&1; echo "exit=$?" >> /tmp/m4push.txt
```
Read `/tmp/m4push.txt`; expect the `main -> main` refspec line and `exit=0`.

---

## Self-review notes (for the implementer)

- **Spec coverage:** §2.2 TreeNode + §2.3 IPC (Task 1), §2.4 scan rules (Task 2), openFolder/scan handlers (Task 3), §3.2 flattenTree (Task 4), §3.1 vaultStore (Task 5), §3.3 components (Tasks 6,7,11), §3.4 two-column layout + reopen-last-vault (Task 7), §4 watcher + dirty-aware reload (Tasks 8,9), §5 CRUD (Tasks 10,11), §7 tests (Tasks 2,4,5,12). Non-goals (§9) — drag/multi-select/search/tags/hidden-dirs — are not built.
- **Renderer-never-touches-fs invariant:** every fs operation is a main handler reached via `window.margin`; the renderer only imports types from `shared/ipc`.
- **Delete safety:** `trashPath` uses `shell.trashItem` only — there is no `unlink` anywhere (spec §1).
- **Type consistency:** `TreeNode` is defined once in `shared/ipc.ts` and imported everywhere; `MarginApi` is fully implemented by preload after Task 3 (stubs) + Tasks 8/10 (handlers). `documentStore.reset()` is added in Task 9 and used in Tasks 9 & 11.
- **Carry-over:** the existing `saveDocument` line at the end of documentStore is left intact; M3 theme + M2 live-preview are untouched.
- **Known minor:** CRUD uses native `window.prompt/confirm` (deliberately minimal); a styled inline-rename input is a future refinement, not in M4.
