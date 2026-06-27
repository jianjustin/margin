# Lettera UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Margin editor UI to match the Lettera design spec — redesigned sidebar header, colored file-type icons, new center toolbar with word-count badge, Outline/Schedule tab panel, and a two-column Settings panel with static Plugin Market shell.

**Architecture:** Component-by-component in-place refactor (Approach A). No new routing or state machines introduced. Each task modifies exactly the component files it owns; later tasks may touch `App.tsx` to wire new props. Plugin Market is a static React component with zero real install logic.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, lucide-react icons, Zustand stores, Tauri 2 desktop shell.

## Global Constraints

- All Tailwind classes must be inline (no `@apply` in component files — only `index.css` uses `@apply`).
- CSS custom properties (`var(--...)`) from `src/renderer/src/theme/tokens.css` are the only source for colors — no raw hex in component files.
- New color tokens (e.g. yellow folder) must be added to `tokens.css` in both `:root` (dark) and `[data-theme='light']` blocks.
- Icon imports must come from `lucide-react`; no SVG inline blobs.
- No new npm packages — use only existing dependencies.
- Verify each task by running `pnpm demo` (`vite --config vite.demo.config.ts`, port 5199) and inspecting in the browser, **not** the full Tauri build.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/src/theme/tokens.css` | Modify | Add `--folder-icon` yellow token and `--file-badge-*` color tokens |
| `src/renderer/src/components/FileTree/FileTreeRow.tsx` | Modify | Colored badge-style file-type icons; yellow folder icon |
| `src/renderer/src/components/FileTree/Sidebar.tsx` | Modify | Vault-name header with search + new-note buttons; remove old toolbar |
| `src/renderer/src/App.tsx` | Modify | Center toolbar: word-count badge, reorder right-side buttons |
| `src/renderer/src/components/OutlineDrawer.tsx` | Modify | Outline / Schedule tab bar at top |
| `src/renderer/src/components/SettingsPanel.tsx` | Modify | Two-column layout: left nav (General/Editor/Sync/Shortcuts/Plugins/Advanced) + right content; `General` maps existing settings; `Editor` adds toggle rows |
| `src/renderer/src/components/PluginMarket.tsx` | Create | Static Plugin Market shell with category nav + example cards |

---

## Task 1: Color tokens for new icon palette

**Files:**
- Modify: `src/renderer/src/theme/tokens.css`

**Interfaces:**
- Produces: CSS custom properties `--folder-icon`, `--badge-md`, `--badge-img`, `--badge-pdf`, `--badge-txt`, `--badge-other` available in all component files.

- [ ] **Step 1: Add dark-mode tokens**

In `tokens.css`, inside the existing `:root` block (after `--sidebar-icon` line), add:

```css
  --folder-icon: oklch(0.78 0.12 68);
  --badge-md:    oklch(0.62 0.12 250);
  --badge-img:   oklch(0.58 0.12 145);
  --badge-pdf:   oklch(0.58 0.16 25);
  --badge-txt:   oklch(0.55 0.02 70);
  --badge-other: oklch(0.48 0.01 70);
```

- [ ] **Step 2: Add light-mode tokens**

In the `[data-theme='light']` block (after `--sidebar-icon` line), add:

```css
  --folder-icon: oklch(0.72 0.14 60);
  --badge-md:    oklch(0.46 0.14 250);
  --badge-img:   oklch(0.44 0.14 145);
  --badge-pdf:   oklch(0.50 0.18 25);
  --badge-txt:   oklch(0.42 0.02 70);
  --badge-other: oklch(0.54 0.01 70);
```

- [ ] **Step 3: Verify tokens load**

Run: `pnpm demo`
Open DevTools → Elements → `:root`. Confirm `--folder-icon` and `--badge-md` appear.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/theme/tokens.css
git commit -m "feat(ui): add icon palette tokens for Lettera redesign"
```

---

## Task 2: Colored file-type icons in the file tree

**Files:**
- Modify: `src/renderer/src/components/FileTree/FileTreeRow.tsx`

**Interfaces:**
- Consumes: `--folder-icon`, `--badge-md`, `--badge-img`, `--badge-pdf`, `--badge-txt`, `--badge-other` from Task 1.
- Produces: no interface changes — same props, updated visual output.

**Design spec:** Each file row shows a small coloured rectangular badge (16×16 px, rounded 3px) containing a short all-caps label. Folders get a yellow `Folder` icon instead of the default muted one. The badge background is the badge color at 14% opacity; label text is the badge color at full opacity.

- [ ] **Step 1: Replace `fileIconLabel` with `fileBadge`**

Replace the `fileIconLabel` function and its return type with:

```tsx
interface FileBadge {
  label: string
  colorVar: string
}

function fileBadge(ext: string): FileBadge {
  switch (ext) {
    case 'md':
    case 'mdx':
    case 'markdown':
      return { label: 'ad', colorVar: '--badge-md' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return { label: 'img', colorVar: '--badge-img' }
    case 'pdf':
      return { label: 'pdf', colorVar: '--badge-pdf' }
    case 'txt':
      return { label: 'txt', colorVar: '--badge-txt' }
    default:
      return { label: ext.slice(0, 3) || '···', colorVar: '--badge-other' }
  }
}
```

- [ ] **Step 2: Update the icon variable inside the component**

In `FileTreeRow`, change:

```tsx
const icon = isFolder ? null : fileIconLabel(ext)
```

to:

```tsx
const badge = isFolder ? null : fileBadge(ext)
```

- [ ] **Step 3: Update folder icon color**

Find the folder `<Folder>` element and change its className to use the new token:

```tsx
{isFolder ? (
  <Folder size={14} className="flex-none" style={{ color: 'var(--folder-icon)' }} />
) : (
```

- [ ] **Step 4: Update badge render**

Replace the existing `<span>` that renders the icon label with:

```tsx
  <span
    className="grid h-[16px] w-[16px] flex-none place-items-center rounded-[3px] font-[family-name:var(--mono)] text-[8px] font-bold uppercase tracking-tight"
    style={{
      color: `var(${badge?.colorVar})`,
      background: `color-mix(in oklch, var(${badge?.colorVar}) 14%, transparent)`
    }}
  >
    {badge?.label}
  </span>
```

- [ ] **Step 5: Verify visually**

`pnpm demo` → open a vault → confirm: markdown files show a blue "ad" badge, image files show a green "img" badge, pdf shows red "pdf" badge, folders show yellow icon.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/FileTree/FileTreeRow.tsx
git commit -m "feat(ui): colored file-type badge icons matching Lettera design"
```

---

## Task 3: Sidebar header — vault name + search/new icons

**Files:**
- Modify: `src/renderer/src/components/FileTree/Sidebar.tsx`

**Interfaces:**
- Consumes (existing): `onOpenSearch`, `onOpenFolder` callbacks from `App.tsx`.
- Consumes (new): no new prop — derives vault name from `useVaultStore((s) => s.root)`.
- Produces: `onNewNote` prop (type `() => void`) added to `SidebarProps` — called when the `+` button is clicked. `App.tsx` (Task 4) wires this to the existing new-note flow.

**Design spec:** The sidebar header row shows the vault folder's basename ("Writing") as a `font-semibold text-[13px]` label on the left. The right side has a search button and a `+` new-note button. The old FolderOpen / AppWindow / PanelLeftClose / CalendarPlus buttons are removed from the sidebar header (sidebar collapse moves to App toolbar in Task 4; folder open moves to center toolbar).

- [ ] **Step 1: Add `onNewNote` to `SidebarProps`**

```tsx
interface SidebarProps {
  width: number
  scheduleEnabled?: boolean
  onOpenFolder?: () => void
  onOpenSearch?: () => void
  onOpenToday?: () => void
  onCollapse?: () => void
  onNewWindow?: () => void
  onNewNote?: () => void          // ← new
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}
```

- [ ] **Step 2: Derive vault display name**

Inside `SidebarInner`, below the existing `const root = useVaultStore(...)` line, add:

```tsx
const vaultName = root ? root.split('/').filter(Boolean).pop() ?? root : null
```

- [ ] **Step 3: Replace the toolbar `<div>` with the new header**

Replace the entire `{showToolbar && (<div data-tauri-drag-region ...>...</div>)}` block with:

```tsx
<div
  data-tauri-drag-region
  className="flex h-[40px] shrink-0 items-center justify-between px-3"
>
  <span
    className="select-none truncate text-[13px] font-semibold text-foreground [-webkit-app-region:no-drag]"
    title={root ?? undefined}
  >
    {vaultName ?? 'Margin'}
  </span>

  <div className="flex items-center gap-0.5 [-webkit-app-region:no-drag]">
    <button
      onClick={onOpenSearch}
      disabled={!root}
      title="搜索文件 (⌘K)"
      aria-label="搜索文件"
      className={toolbarButton()}
    >
      <Search size={15} />
    </button>
    {onNewNote && (
      <button
        onClick={onNewNote}
        disabled={!root}
        title="新建笔记"
        aria-label="新建笔记"
        className={toolbarButton()}
      >
        <Plus size={15} />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Add `Plus` to imports**

```tsx
import { Plus, Search } from 'lucide-react'
```

Remove unused imports: `AppWindow`, `CalendarPlus`, `FolderOpen`, `PanelLeftClose`.

- [ ] **Step 5: Remove `showToolbar` guard and `onCollapse`/`onNewWindow` references**

Delete the `const showToolbar = Boolean(...)` block. Remove references to `onCollapse`, `onNewWindow`, `scheduleEnabled` / `onOpenToday` from the destructured props in `SidebarInner` (keep them in the interface for backwards compat but unused). In the vault-present block, remove the `showToolbar ? 'pt-1' : 'pt-2'` conditional — always use `pt-0`.

- [ ] **Step 6: Wire `onNewNote` in `App.tsx`**

In `App.tsx`, find `<Sidebar` and add:

```tsx
onNewNote={() => {
  const root = useVaultStore.getState().root
  const tree = useVaultStore.getState().tree
  if (!root || !tree.length) return
  const firstFolder = tree.find((n) => n.type === 'folder') ?? { ...tree[0], type: 'folder' as const }
  if (firstFolder) setDialog({ type: 'newNote', folder: firstFolder })
}}
```

- [ ] **Step 7: Verify**

`pnpm demo` → open a vault → confirm: sidebar header shows vault name on left, search + plus on right; no folder/window/collapse icons; `+` triggers the new-note dialog.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/FileTree/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): sidebar header with vault name and new-note button"
```

---

## Task 4: Center toolbar redesign — word-count badge, reordered buttons

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useDocStats` hook (already imported via `StatusBar`; import it directly in `App.tsx`).
- Produces: no interface changes.

**Design spec:** The right side of the center toolbar shows: (1) a blue word-count badge (e.g. `27`), (2) a sidebar-toggle icon when sidebar is collapsed (already exists), (3) a right-panel toggle icon. `ThemeToggle`, `CalendarDays`, and `Link2` (backlinks) buttons are removed from the toolbar — ThemeToggle moves to Settings General tab (Task 5). The backlinks panel toggle is removed for now (backlinks feature remains accessible via its existing keyboard shortcut if one exists). Calendar remains accessible via the Settings schedule section. The Settings gear icon stays.

- [ ] **Step 1: Import `useDocStats` and `useDocumentStore` in App.tsx header area**

`useDocStats` is already available at `@/hooks/useDocStats`. Add this subscriber component near the top of `App.tsx`, next to `DirtyDot`:

```tsx
function WordCountBadge(): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const { words } = useDocStats(content)
  if (!words) return <></>
  return (
    <span className="grid h-[20px] min-w-[24px] place-items-center rounded-full bg-[color:var(--accent-soft)] px-1.5 font-[family-name:var(--mono)] text-[10.5px] font-semibold tabular-nums text-[color:var(--accent)]">
      {words}
    </span>
  )
}
```

- [ ] **Step 2: Replace the right-side button group in the `<header>`**

Find the `<div className="relative flex gap-0.5 [-webkit-app-region:no-drag]">` block (currently contains ThemeToggle, Calendar, Outline, Backlinks, Settings). Replace its entire contents with:

```tsx
<WordCountBadge />
<button
  onClick={() => setSettingsOpen(true)}
  title="设置 (⌘,)"
  aria-label="设置"
  className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
>
  <Settings size={16} />
</button>
<button
  onClick={() => setDrawerOpen((v) => !v)}
  title="大纲 (⌘\)"
  aria-label="切换大纲"
  className={[
    'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
    drawerOpen
      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
      : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
  ].join(' ')}
>
  <PanelRight size={16} />
</button>
```

- [ ] **Step 3: Add `PanelRight` to lucide imports; remove `AlignLeft`, `Link2`, `CalendarDays`**

```tsx
import { PanelLeft, PanelRight, Settings } from 'lucide-react'
```

- [ ] **Step 4: Remove `backlinksOpen` state and `BacklinksPanel` render**

Delete:
- `const [backlinksOpen, setBacklinksOpen] = useState(false)`
- The `{backlinksOpen && path && (<BacklinksPanel .../>)}` render block
- The `BacklinksPanel` import

Also remove `calendarOpen` state and `CalendarPopover` render block (calendar will live in settings in Task 5; remove `CalendarPopover` import too). Keep `scheduleEnabled` store subscription as it's used in `openSchedule`.

- [ ] **Step 5: Verify**

`pnpm demo` → open a doc → confirm: right toolbar shows word count badge, settings icon, panel-right icon; no calendar/theme/backlinks buttons; clicking panel icon opens outline drawer.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(ui): center toolbar word-count badge and Lettera button layout"
```

---

## Task 5: Outline/Schedule tab panel

**Files:**
- Modify: `src/renderer/src/components/OutlineDrawer.tsx`

**Interfaces:**
- Consumes: existing `useDocumentStore`, existing `parseHeadings` (internal).
- Produces: same external API (`OutlineDrawerProps`: `{ width, onJumpToLine? }`). No prop changes.

**Design spec:** A tab bar at the top shows `Outline` and `Schedule`. The active tab has a bottom border in `var(--accent)`. Outline tab retains the existing heading list. Schedule tab shows a static placeholder ("日程功能将在这里显示") — no real schedule data in this task.

- [ ] **Step 1: Add tab state**

At the top of `OutlineDrawer`, add:

```tsx
const [tab, setTab] = useState<'outline' | 'schedule'>('outline')
```

- [ ] **Step 2: Replace the current `<aside>` header `<div>` with a tab bar**

Replace:
```tsx
<div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
  <span className="text-[13px] font-semibold tracking-wide">大纲</span>
  <span className="text-[11px] text-[color:var(--text-faint)]">点击跳转</span>
</div>
```

With:
```tsx
<div className="flex shrink-0 border-b border-[color:var(--border-soft)]">
  {(['outline', 'schedule'] as const).map((t) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className={[
        'flex-1 py-2.5 text-[12px] font-medium transition-colors',
        tab === t
          ? 'border-b-2 border-[color:var(--accent)] text-foreground'
          : 'text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
      ].join(' ')}
    >
      {t === 'outline' ? 'Outline' : 'Schedule'}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Wrap the outline list in a conditional**

Wrap the existing `<div className="flex-1 overflow-y-auto px-2.5 pb-4">` block:

```tsx
{tab === 'outline' ? (
  <div className="flex-1 overflow-y-auto px-2.5 pb-4">
    {/* existing headings list unchanged */}
  </div>
) : (
  <div className="flex flex-1 items-center justify-center text-[12.5px] text-[color:var(--text-faint)]">
    日程功能将在这里显示
  </div>
)}
```

- [ ] **Step 4: Update the heading label in the outline list**

Inside the Outline tab, remove the old `TABLE OF CONTENTS` label (it doesn't exist — the existing code goes straight to the list). Add a small section header above the list:

```tsx
<div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
  Table of Contents
</div>
```

Place it just before the `{headings.length === 0 ? (` conditional.

- [ ] **Step 5: Verify**

`pnpm demo` → open a markdown doc with headings → open the right panel → confirm: tab bar shows Outline / Schedule; clicking switches content; Outline shows heading list; Schedule shows placeholder.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/OutlineDrawer.tsx
git commit -m "feat(ui): Outline/Schedule tab bar in right panel"
```

---

## Task 6: Settings panel two-column redesign

**Files:**
- Modify: `src/renderer/src/components/SettingsPanel.tsx`
- Create: `src/renderer/src/components/PluginMarket.tsx`

**Interfaces:**
- `SettingsPanel` props unchanged: `{ tree: TreeNode[], onClose: () => void }`.
- `PluginMarket` props: `{ onBack: () => void }` — called when user clicks back from plugin market into the main settings.

**Design spec:** Settings becomes a 680×520px modal with two columns. Left column (160px): nav items `General`, `Editor`, `Sync`, `Shortcuts`, `Plugins`, `Advanced` as buttons. Active item has blue left-border highlight. Right column: scrollable content area. General tab maps all existing settings. Editor tab adds three toggle rows: Typewriter mode, Show markdown syntax, Spellcheck (all wired to `useSettingsStore`). Sync / Shortcuts / Advanced show a "即将推出" placeholder. Plugins opens the `PluginMarket` overlay.

**Typewriter mode toggle:** `useSettingsStore` may not have a `typwriterMode` field yet. Check `src/renderer/src/stores/settingsStore.ts` before implementing. If absent, use local component state (`useState(false)`) for a static demo.

- [ ] **Step 1: Check settingsStore for typwriterMode**

```bash
grep -n "typewriter\|typwriter\|showMarkdown\|spellcheck" \
  src/renderer/src/stores/settingsStore.ts
```

If the fields exist, use them from `useSettingsStore`. If absent, declare local state at the top of `SettingsPanel`:

```tsx
const [typwriterMode, setTypwriterMode] = useState(false)
const [showMarkdownSyntax, setShowMarkdownSyntax] = useState(true)
const [spellcheck, setSpellcheck] = useState(false)
```

- [ ] **Step 2: Add nav state and `PluginMarket` state**

At the top of `SettingsPanel`, add:

```tsx
type SettingsTab = 'general' | 'editor' | 'sync' | 'shortcuts' | 'plugins' | 'advanced'
const [activeTab, setActiveTab] = useState<SettingsTab>('general')
const [pluginMarketOpen, setPluginMarketOpen] = useState(false)
```

- [ ] **Step 3: Replace the entire return JSX of `SettingsPanel`**

```tsx
return (
  <div
    className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0_0_0/0.4)]"
    onClick={onClose}
  >
    <div
      className="flex h-[520px] w-[680px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Left nav */}
      <div className="flex w-[160px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
        <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
          设置
        </div>
        {(
          [
            { id: 'general',   label: 'General' },
            { id: 'editor',    label: 'Editor' },
            { id: 'sync',      label: 'Sync' },
            { id: 'shortcuts', label: 'Shortcuts' },
            { id: 'plugins',   label: 'Plugins' },
            { id: 'advanced',  label: 'Advanced' },
          ] as { id: SettingsTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'plugins') { setPluginMarketOpen(true); return }
              setActiveTab(id)
            }}
            className={[
              'flex items-center gap-2 border-l-2 px-4 py-2 text-left text-[13px] transition-colors',
              activeTab === id && id !== 'plugins'
                ? 'border-l-[color:var(--accent)] bg-[color:var(--accent-soft)] font-medium text-[color:var(--accent)]'
                : 'border-l-transparent text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="mx-3 mt-2 rounded-md px-3 py-1.5 text-[12px] text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          关闭
        </button>
      </div>

      {/* Right content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        {activeTab === 'general' && <GeneralTab tree={tree} />}
        {activeTab === 'editor' && <EditorTab />}
        {(activeTab === 'sync' || activeTab === 'shortcuts' || activeTab === 'advanced') && (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[color:var(--text-faint)]">
            即将推出
          </div>
        )}
      </div>
    </div>

    {pluginMarketOpen && (
      <PluginMarket onBack={() => setPluginMarketOpen(false)} />
    )}
  </div>
)
```

- [ ] **Step 4: Extract `GeneralTab` component**

Below `AppSwitch`, above `SettingsPanel`, add:

```tsx
function GeneralTab({ tree }: { tree: TreeNode[] }): JSX.Element {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)
  const assetsDir = useSettingsStore((s) => s.assetsDir)
  const plantUmlServerUrl = useSettingsStore((s) => s.plantUmlServerUrl)
  const diagramFitWidth = useSettingsStore((s) => s.diagramFitWidth)
  const mathEnabled = useSettingsStore((s) => s.mathEnabled)
  const setScheduleEnabled = useSettingsStore((s) => s.setScheduleEnabled)
  const setScheduleDir = useSettingsStore((s) => s.setScheduleDir)
  const addHiddenFolder = useSettingsStore((s) => s.addHiddenFolder)
  const removeHiddenFolder = useSettingsStore((s) => s.removeHiddenFolder)
  const setAssetsDir = useSettingsStore((s) => s.setAssetsDir)
  const setPlantUmlServerUrl = useSettingsStore((s) => s.setPlantUmlServerUrl)
  const setDiagramFitWidth = useSettingsStore((s) => s.setDiagramFitWidth)
  const setMathEnabled = useSettingsStore((s) => s.setMathEnabled)
  const updater = useUpdater()
  const [hiddenInput, setHiddenInput] = useState('')
  const folders = useMemo(() => topFolders(tree), [tree])

  const sectionTitle = 'mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)] first:mt-0'
  const rowClass = 'flex items-center justify-between gap-3 py-2.5 border-b border-[color:var(--border-soft)] last:border-b-0'
  const labelClass = 'text-[13px] text-foreground'
  const descClass = 'mt-0.5 text-[11.5px] text-[color:var(--text-faint)]'

  function submitHiddenFolder(): void {
    const value = hiddenInput.trim()
    if (!value) return
    addHiddenFolder(value)
    setHiddenInput('')
  }

  return (
    <div>
      {/* ── APPEARANCE ── */}
      <div className={sectionTitle}>Appearance</div>
      <div className="space-y-0 divide-y divide-[color:var(--border-soft)]">
        <div className={rowClass}>
          <div>
            <div className={labelClass}>Theme</div>
            <div className={descClass}>Match the editor to your environment</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ── 日程 ── */}
      <div className={sectionTitle}>日程</div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>启用日程功能</div>
          <div className={descClass}>在标题栏显示日程入口和日历</div>
        </div>
        <AppSwitch checked={scheduleEnabled} onChange={setScheduleEnabled} label="启用日程功能" />
      </div>
      {scheduleEnabled && (
        <div className="pb-2 pt-1">
          <div className={`${labelClass} mb-1.5`}>日程目录</div>
          <FolderPicker value={scheduleDir} folders={folders} onChange={setScheduleDir} />
          <div className={`${descClass} mt-1.5`}>每日日程笔记保存在此文件夹中（不存在时自动创建）</div>
        </div>
      )}

      {/* ── 文件库 ── */}
      <div className={sectionTitle}>文件库</div>
      <div className={`${labelClass} mb-1.5`}>隐藏文件夹</div>
      <div className="flex items-center gap-2">
        <input
          value={hiddenInput}
          onChange={(e) => setHiddenInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitHiddenFolder() }}
          placeholder=".claude 或 Projects/archive"
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
        />
        <button
          onClick={submitHiddenFolder}
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-[color:var(--border-soft)] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
          aria-label="添加隐藏文件夹"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className={`${descClass} mt-1.5`}>不含斜杠按文件夹名隐藏；含斜杠按文件库相对路径隐藏。</div>
      <div className="mt-2 flex flex-col gap-1">
        {hiddenFolders.length === 0 ? (
          <div className={descClass}>未配置隐藏文件夹</div>
        ) : (
          hiddenFolders.map((rule) => (
            <div key={rule} className="flex items-center gap-2 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--mono)] text-[12px] text-[color:var(--text-dim)]">{rule}</span>
              <button
                onClick={() => removeHiddenFolder(rule)}
                className="grid h-5 w-5 flex-none place-items-center rounded text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--red)]"
                aria-label={`移除隐藏规则 ${rule}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── 富内容 ── */}
      <div className={sectionTitle}>富内容</div>
      <div className={`${labelClass} mb-1.5`}>图片资产目录</div>
      <input
        value={assetsDir}
        onChange={(e) => setAssetsDir(e.target.value)}
        placeholder="assets"
        className="w-full rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
      />
      <div className={`${descClass} mt-1.5`}>拖拽或粘贴图片时复制到此文件库相对目录。</div>
      <div className="mt-3">
        <div className={`${labelClass} mb-1.5`}>图表渲染服务</div>
        <input
          value={plantUmlServerUrl}
          onChange={(e) => setPlantUmlServerUrl(e.target.value)}
          placeholder="https://kroki.io"
          className="w-full rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)]"
        />
        <div className={`${descClass} mt-1.5`}>PlantUML 和 DOT 使用 Kroki 兼容接口；Mermaid 本地渲染。</div>
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>图表自适应宽度</div>
          <div className={descClass}>关闭后保留原始尺寸并横向滚动</div>
        </div>
        <AppSwitch checked={diagramFitWidth} onChange={setDiagramFitWidth} label="图表自适应宽度" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>数学公式</div>
          <div className={descClass}>使用 KaTeX 渲染行内和块级 LaTeX</div>
        </div>
        <AppSwitch checked={mathEnabled} onChange={setMathEnabled} label="数学公式" />
      </div>

      {/* ── 关于 ── */}
      <div className={sectionTitle}>关于</div>
      <UpdateSection updater={updater} />
    </div>
  )
}
```

- [ ] **Step 5: Add `EditorTab` component**

Below `GeneralTab`, add:

```tsx
function EditorTab(): JSX.Element {
  const [typwriterMode, setTypwriterMode] = useState(false)
  const [showMarkdownSyntax, setShowMarkdownSyntax] = useState(true)
  const [spellcheck, setSpellcheck] = useState(false)

  const sectionTitle = 'mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)] first:mt-0'
  const rowClass = 'flex items-center justify-between gap-3 py-2.5 border-b border-[color:var(--border-soft)] last:border-b-0'
  const labelClass = 'text-[13px] text-foreground'
  const descClass = 'mt-0.5 text-[11.5px] text-[color:var(--text-faint)]'

  return (
    <div>
      <div className={sectionTitle}>Editor</div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Typewriter mode</div>
          <div className={descClass}>Keep the current line centered</div>
        </div>
        <AppSwitch checked={typwriterMode} onChange={setTypwriterMode} label="Typewriter mode" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Show markdown syntax</div>
          <div className={descClass}>Reveal # * {'>'} markers on the active line</div>
        </div>
        <AppSwitch checked={showMarkdownSyntax} onChange={setShowMarkdownSyntax} label="Show markdown syntax" />
      </div>
      <div className={rowClass}>
        <div>
          <div className={labelClass}>Spellcheck</div>
          <div className={descClass}>Underline misspelled words</div>
        </div>
        <AppSwitch checked={spellcheck} onChange={setSpellcheck} label="Spellcheck" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update `SettingsPanel` imports**

Add `PluginMarket` import (from next task — add after creating the file):

```tsx
import { PluginMarket } from '@/components/PluginMarket'
import { ThemeToggle } from '@/components/ThemeToggle'
```

Also ensure `Plus` is imported from lucide.

- [ ] **Step 7: Verify**

`pnpm demo` → open Settings (⌘,) → confirm: two-column layout; General shows existing settings + ThemeToggle; Editor shows three toggles; Plugins nav item opens plugin market overlay.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/SettingsPanel.tsx
git commit -m "feat(ui): two-column Settings panel with General and Editor tabs"
```

---

## Task 7: Plugin Market static UI shell

**Files:**
- Create: `src/renderer/src/components/PluginMarket.tsx`

**Interfaces:**
- Props: `{ onBack: () => void }`
- No store access — all data is static.

**Design spec:** Full-screen overlay (same z-index backdrop as Settings) containing a two-column panel. Left (200px): header "Plugins" + category nav (`Featured` [active], `Editor`, `Export`, `Themes`, `Sync & Backup`, `Productivity` + separator + `INSTALLED · 4`). Right: search input row at top, then a grid of example plugin cards. Each card: icon area (colored rounded square, 40px), plugin name (bold), author name, star rating (`★ 4.8`). Show 4 static example cards.

- [ ] **Step 1: Create `PluginMarket.tsx`**

```tsx
import { Search, Star, X } from 'lucide-react'
import { useState } from 'react'

interface PluginMarketProps {
  onBack: () => void
}

const CATEGORIES = [
  'Featured',
  'Editor',
  'Export',
  'Themes',
  'Sync & Backup',
  'Productivity',
] as const

const PLUGINS = [
  { name: 'Fuzzy Keyboard', author: 'keybind.io', rating: 4.9, color: 'oklch(0.55 0.14 250)', initials: '⌘' },
  { name: 'Push Notify', author: 'pushly.dev', rating: 4.8, color: 'oklch(0.58 0.12 160)', initials: '⇧' },
  { name: 'Table Editor', author: 'tabletool', rating: 4.7, color: 'oklch(0.60 0.14 30)', initials: '⊞' },
  { name: 'Git Sync', author: 'gitsync.app', rating: 4.6, color: 'oklch(0.55 0.08 200)', initials: 'G' },
]

export function PluginMarket({ onBack }: PluginMarketProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>('Featured')
  const [query, setQuery] = useState('')

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[oklch(0_0_0/0.5)]">
      <div
        className="flex h-[520px] w-[720px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <div className="flex w-[200px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[13px] font-semibold">Plugins</span>
            <button
              onClick={onBack}
              className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
              aria-label="关闭插件市场"
            >
              <X size={14} />
            </button>
          </div>

          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'flex items-center gap-2 border-l-2 px-4 py-2 text-left text-[13px] transition-colors',
                activeCategory === cat
                  ? 'border-l-[color:var(--accent)] bg-[color:var(--accent-soft)] font-medium text-[color:var(--accent)]'
                  : 'border-l-transparent text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground',
              ].join(' ')}
            >
              {cat === 'Featured' && <Star size={13} className="flex-none" />}
              {cat}
            </button>
          ))}

          <div className="my-2 mx-4 border-t border-[color:var(--border-soft)]" />

          <div className="px-4 py-1 text-[11.5px] font-medium text-[color:var(--text-faint)]">
            INSTALLED · 4
          </div>
        </div>

        {/* Right content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-4 py-2.5">
            <Search size={14} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
            />
          </div>

          {/* Plugin grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
              Popular
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PLUGINS.map((plugin) => (
                <div
                  key={plugin.name}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--bg)] p-3 transition-colors hover:border-[color:var(--accent-line)] hover:bg-[color:var(--bg-hover)]"
                >
                  <div
                    className="grid h-10 w-10 flex-none place-items-center rounded-lg text-[18px] text-white"
                    style={{ background: plugin.color }}
                  >
                    {plugin.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-foreground">{plugin.name}</div>
                    <div className="text-[11.5px] text-[color:var(--text-faint)]">{plugin.author}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[color:var(--accent)]">
                      <Star size={11} className="fill-current" />
                      {plugin.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Import `PluginMarket` in `SettingsPanel.tsx`**

At the top of `SettingsPanel.tsx`, add:

```tsx
import { PluginMarket } from '@/components/PluginMarket'
```

- [ ] **Step 3: Verify**

`pnpm demo` → open Settings → click "Plugins" → confirm: Plugin Market overlay appears on top; category nav highlights active item; plugin cards render with colored icons; X button returns to Settings; search input accepts text.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/PluginMarket.tsx src/renderer/src/components/SettingsPanel.tsx
git commit -m "feat(ui): Plugin Market static shell with category nav and plugin cards"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Sidebar vault name header (Task 3)
- ✅ File tree colored badges (Task 2)
- ✅ Yellow folder icon (Task 2)
- ✅ Center toolbar word-count badge (Task 4)
- ✅ Outline/Schedule tab panel (Task 5)
- ✅ Settings two-column layout (Task 6)
- ✅ Settings General tab with ThemeToggle (Task 6)
- ✅ Settings Editor tab with three toggles (Task 6)
- ✅ Plugin Market left nav (Task 7)
- ✅ Plugin Market plugin cards (Task 7)
- ⚠️ `ThemeToggle` moved from toolbar to Settings — `App.tsx` Task 4 removes it from toolbar; `GeneralTab` renders it. Confirm `ThemeToggle` accepts no required props before Task 6 Step 4.

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `fileBadge` defined in Task 2, used only internally — no cross-task type dependency.
- `SettingsTab` type defined and used within `SettingsPanel.tsx` only.
- `PluginMarket` props `{ onBack: () => void }` matches the usage in Task 6 Step 3 (`onBack={() => setPluginMarketOpen(false)}`).
- `GeneralTab` and `EditorTab` are internal-only; no external consumers.
