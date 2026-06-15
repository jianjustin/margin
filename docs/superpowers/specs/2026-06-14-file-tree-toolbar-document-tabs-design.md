---
title: File tree toolbar and multi-tab documents
tags: [项目, 笔记软件, spec, tabs, file-tree]
created: 2026-06-14
status: approved
---

# File Tree Toolbar and Multi-Tab Documents — Design Spec

## 0. Goal

Move the current left titlebar action group into the file tree header, ordered as
`打开文件夹 → 搜索 → 今日日程 → 折叠侧栏`, and add true multi-tab document editing for the current session.

The tab model must keep one tab per absolute file path. Clicking a file that is already open activates its existing tab instead of opening a duplicate.

## 1. Current Structure

The relevant current implementation is:

- `src/renderer/src/App.tsx`
  - Owns titlebar buttons, side pane visibility, open/search/schedule handlers, editor wiring, autosave, context menus, and dialogs.
  - Reads `useDocumentStore((s) => s.path)` and `epoch` as a single active document.
- `src/renderer/src/components/FileTree/Sidebar.tsx`
  - Renders only the file tree container and "文件库" label.
- `src/renderer/src/stores/documentStore.ts`
  - Stores a single document: `path`, `content`, `savedContent`, `saveStatus`, `epoch`, `pendingDraft`, and `conflict`.
- `src/renderer/src/lib/saveDocument.ts`
  - Saves the single current document and raises conflict if disk content changed externally.
- `src/renderer/src/hooks/useDraft.ts`
  - Periodically writes a crash-recovery draft for the single current dirty document.
- `src/renderer/src/hooks/useVaultWatch.ts`
  - Reconciles the single current document when the vault changes.

This feature requires a state-model change because visual tabs without per-tab document state would lose unsaved edits during tab switches.

## 2. File Tree Toolbar

The left action group moves from the global titlebar into the file tree header.

Toolbar order:

1. `打开文件夹`
2. `搜索`
3. `今日日程` when schedule is enabled
4. `折叠侧栏`

The toolbar remains visible when no vault is open. In that state:

- `打开文件夹` is enabled.
- `搜索` is disabled.
- `今日日程` is shown only when schedule is enabled.
- `折叠侧栏` remains enabled.

When the sidebar is collapsed, the global titlebar shows a single lightweight restore button so the user can reopen the sidebar.

The global titlebar keeps editor/window-level actions on the right: theme, calendar popover, outline, backlinks, and settings.

## 3. Multi-Tab Document Model

`documentStore` becomes a true multi-document store:

```ts
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
}
```

Each tab owns its content, saved baseline, save state, editor remount epoch, pending draft, and external-change conflict.

Core actions:

- `openOrActivate(path, content)` creates a tab when absent, otherwise activates the existing tab.
- `setActivePath(path)` changes the active tab without reading disk.
- `setActiveContent(content)` changes only the active tab and updates its save status.
- `closeTab(path)` removes a tab and activates the right neighbor, then the left neighbor, then no tab.
- `replacePath(oldPath, newPath, content?)` updates an open tab after rename or move.
- `removePath(path)` closes an open tab after delete.
- `setPendingDraft(path, draft)`, `applyDraft(path)`, `setConflict(path, disk)`, `keepMine(path)`, and `takeDisk(path)` operate on a specific tab.

The store exposes active-document selectors and compatibility fields where useful, but the authoritative state is `tabs + activePath`.

## 4. Tab UI

Add `src/renderer/src/components/DocumentTabs.tsx`.

Placement:

- Under the global titlebar.
- Above the editor body, draft banner, and conflict bar.
- Only in the main editor column, not inside the Tauri drag region.

Behavior:

- Each tab shows the file name.
- Dirty tabs show a small accent dot.
- The active tab is visually distinct.
- Each tab has a close button.
- Clicking a tab activates it and updates file tree selection.
- Closing a dirty tab attempts to save first.
- If saving fails or the tab has a conflict, closing is cancelled and that tab is activated.

No cross-restart tab restoration is included.

## 5. Data Flow

### Opening files

File tree click and search result open both call the same path:

1. Read file from disk only when the path is not already open.
2. `openOrActivate(path, text)`.
3. Select the path in `vaultStore`.
4. If a draft exists and differs from disk content, attach it to that tab with `setPendingDraft(path, draft)`.

### Editing

The CodeMirror editor remains uncontrolled and keyed by `${activePath}:${activeTab.epoch}`. `onChange` writes through `setActiveContent`.

### Saving

`saveDocument(writeFile, readFile, path?)` saves the specified tab or the active tab.

For each save:

- If the tab is clean, there is no write.
- If the tab has a conflict, saving is paused.
- If disk differs from `savedContent` and from `content`, the tab receives `conflict`.
- On success, only that tab is marked saved.
- On failure, only that tab is marked error.

### Drafts

`useDraft` scans all open dirty tabs every interval. It writes one draft per dirty tab and deletes a draft when that specific tab becomes saved.

Switching tabs does not delete any draft.

### Vault watch

`useVaultWatch` reconciles all open tabs when the vault changes:

- Deleted file: close its tab.
- Clean externally modified file: silently update that tab and bump its epoch.
- Dirty externally modified file: set conflict on that tab.

Async reconciliation must check that a tab still exists before applying results.

## 6. Explicit Non-Goals

- Cross-restart restoration of open tabs.
- Duplicate tabs for the same absolute path.
- Multiple editor panes or split view.
- Multi-window document coordination.
- Changes to CodeMirror live preview internals.
- Changes to Tauri IPC contracts unless existing APIs prove insufficient during implementation.

## 7. Verification

Automated checks:

- `npm run test`
- `npm run typecheck`
- `npm run vite:build` if App wiring or build configuration changes cause uncertainty.

Focused tests:

- Multi-tab document store behavior.
- Save conflict and retry behavior per path.
- Draft write/delete behavior for multiple tabs.
- Vault watch reconciliation for multiple tabs.
- File tree toolbar order and disabled states.
- Document tab activation, dirty indicator, and close behavior.

Manual checks:

- Toolbar appears in the file tree with order `打开文件夹 → 搜索 → 今日日程 → 折叠侧栏`.
- Collapsing the sidebar leaves a restore control in the global titlebar.
- Opening the same file twice activates the existing tab.
- Editing two tabs keeps dirty state isolated.
- Closing a dirty tab saves before close.
- Conflict or save error prevents tab close and shows the existing banner/status.
