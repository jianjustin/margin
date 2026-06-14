# File Library Hidden Folders and Calendar Dots Design

## Context

Margin is a Tauri + React Markdown editor for Obsidian-style vaults. The file
library tree is produced by Rust (`src-tauri/src/vault_scanner.rs`) and consumed
by the renderer through `api.scanVault`. Project settings are already persisted
per vault in `<vault>/.margin/config.json` through `useProjectConfig` and
`settingsStore`.

The current scanner skips every path entry whose name starts with `.`, so normal
tool folders such as `.claude` do not appear in the file library. The calendar
red-dot logic reads schedule dates from the visible tree, but it only supports a
top-level schedule folder name. A configured nested schedule folder such as
`Plans/日程` can contain `YYYY-MM-DD.md` files without showing red dots.

## Goals

- Show normal dot-prefixed folders such as `.claude` in the file library.
- Keep internal or high-risk folders hidden: `.margin`, `.obsidian`, `.git`,
  and `.trash`.
- Let users configure hidden folders from Settings.
- Support both folder-name and vault-relative-path hidden rules.
- Fix calendar red dots for nested schedule folders.
- Ensure the title bar can move the whole application window.
- Let users resize the left file library and right outline panes by dragging
  their inner edges.
- Keep file tree, search, move dialog, file-existence checks, and schedule
  lookup on one consistent visible tree.

## Non-Goals

- Do not expose `.margin`, `.obsidian`, `.git`, or `.trash` in the file library.
- Do not let user settings override the built-in protected folder list.
- Do not add glob patterns or regular expressions for hidden folders.
- Do not hide individual files through this setting.
- Do not make calendar dots search the entire vault for date-named files.
- Do not make editor content, file rows, settings panels, or arbitrary blank
  page areas act as window-drag regions.
- Do not add a global layout store unless the implementation needs it for
  existing state boundaries.

## Confirmed Behavior

Dot-prefixed folders are visible by default unless they are built-in hidden
folders or match a user hidden rule. For example, `.claude` and `.vscode` appear
in the file library by default, while `.margin`, `.obsidian`, `.git`, and
`.trash` remain hidden.

User hidden folder rules have two forms:

- Name rule: a rule without `/` or `\`, such as `.claude`, hides folders with
  that exact name at any level of the vault.
- Relative-path rule: a rule with `/` or `\`, such as `Projects/archive`, hides
  the folder at that vault-relative path.

Rules are normalized by trimming whitespace, converting `\` to `/`, removing
leading and trailing slashes, ignoring empty values, and deduplicating.
Built-in hidden folder names are rejected in Settings so users do not think they
can change protected behavior.

Calendar red dots are based only on the configured schedule folder's direct
child files. If `scheduleDir` is `Plans/日程`, then
`Plans/日程/2026-06-14.md` creates a red dot, but
`Plans/日程/archive/2026-06-14.md` does not.

The application window moves when the user drags the title bar's non-interactive
space. Title-bar buttons, popovers, and controls remain regular no-drag
interactive elements.

The left file library and right outline panes can be resized by dragging their
inner boundaries. Widths persist locally on the machine and are restored after
reload.

## Architecture

### Backend Scanner

`src-tauri/src/vault_scanner.rs` becomes the owner of the visible-tree policy.
The scanner accepts hidden folder rules and filters directories before adding
them to the result tree.

The scanner keeps a built-in hidden folder list:

```text
.margin
.obsidian
.git
.trash
```

For each directory entry, the scanner computes its vault-relative path and
checks:

1. Is the directory name in the built-in hidden list?
2. Does the directory name match any name rule?
3. Does the normalized relative path match any relative-path rule?

If any check matches, the directory is skipped and its children are not scanned.
Files are not hidden by these rules; only directories are affected. Markdown
file filtering remains unchanged.

The Tauri command changes from `scan_vault(root)` to
`scan_vault(root, hidden_rules)`. It still validates `root` with
`assert_safe_path`, starts or restarts the watcher for the root, then returns the
filtered visible tree.

### Renderer API and Scan Helper

`src/shared/ipc.ts` and `src/renderer/src/lib/api.ts` update `scanVault` to take
`hiddenFolders: string[]`.

The renderer adds a small helper, for example `scanVaultWithSettings(root)`, that
reads `useSettingsStore.getState().hiddenFolders`, normalizes it, and calls
`api.scanVault(root, hiddenFolders)`. Existing scan call sites use this helper:

- persisted root boot
- opening a folder
- vault change watcher
- manual refresh after create, rename, trash, or move
- schedule `ensureRoot`

This avoids duplicated parameter handling and keeps all tree refreshes aligned
with the current settings.

### Settings Store and Project Config

`Settings` gains:

```ts
hiddenFolders: string[]
```

The default is an empty array. `projectConfigOf` writes the field to
`<vault>/.margin/config.json`. `sanitizeProjectConfig` accepts only string array
values and normalizes them before applying the project config.

The store exposes actions such as:

- `setHiddenFolders(rules: string[]): void`
- `addHiddenFolder(rule: string): void`
- `removeHiddenFolder(rule: string): void`

The exact action names can follow the surrounding implementation style during
planning, but normalization should live in one shared helper so Settings UI,
project-config hydration, and scan calls behave consistently.

### Settings Panel

`src/renderer/src/components/SettingsPanel.tsx` adds a "文件库" section. It shows
the current hidden rules and an input for adding a rule with Enter. Each rule can
be removed.

When hidden rules change:

1. The settings store updates.
2. `useProjectConfig` persists the new project config.
3. The app triggers a tree rescan for the current vault.

If a hidden rule hides the currently open file's parent folder, the visible tree
no longer contains the file. The document can remain open until the user
switches files or closes it; this setting controls file-library visibility, not
whether the editor may hold an already-open document.

### Schedule Path Lookup

`src/renderer/src/lib/schedule.ts` changes `collectScheduleDates` from
top-level folder-name lookup to vault-relative path lookup.

The schedule directory is normalized with the same path-shape rules used for
relative hidden paths: trim whitespace, convert `\` to `/`, and remove leading
or trailing slashes. The lookup walks one path segment at a time through folder
children. Once it finds the target folder, it reads only direct child files whose
names match `YYYY-MM-DD.md` or `YYYY-MM-DD.markdown`.

`openSchedule(date)` uses the normalized `scheduleDir` when building the target
directory path (`root/<scheduleDir>`), so the create/open path and red-dot path
match.

### Window Drag Region

`src/renderer/src/App.tsx` already marks the title bar as a Tauri drag region
with `[-webkit-app-region:drag]` and marks control groups with
`[-webkit-app-region:no-drag]`. The implementation should audit this structure
and keep the drag region on the header while ensuring every interactive control
inside the header and calendar popover stays no-drag.

The accepted scope is conservative: only the title bar's non-interactive space
moves the whole window. The file library, editor, outline drawer, settings
panel, dialogs, and arbitrary blank areas are not window-drag regions.

### Resizable Side Panes

The left file library width becomes state-driven instead of relying only on the
fixed CSS variable `--sidebar-w`. The default width should match the current
visual default. A narrow resize handle sits between the file library and editor.
Dragging it updates the width within min and max bounds.

The right outline drawer also becomes state-driven. A narrow resize handle sits
on the drawer's left edge. Dragging it updates the outline width within min and
max bounds.

Pane widths are stored in `localStorage`, separate from vault project config,
because they are local machine layout preferences rather than vault content
settings. Drag handling should use pointer events, clean up `pointermove` and
`pointerup` listeners after each drag, and temporarily suppress text selection
while dragging.

Suggested bounds:

- Left file library: minimum 180 px, maximum 420 px.
- Right outline drawer: minimum 220 px, maximum 520 px.

If the viewport is too narrow, max bounds should also respect available width so
the editor remains usable.

## Data Flow

Settings flow:

```text
SettingsPanel
  -> settingsStore.hiddenFolders
  -> useProjectConfig subscription
  -> <vault>/.margin/config.json
```

Tree scan flow:

```text
scanVaultWithSettings(root)
  -> settingsStore.hiddenFolders
  -> api.scanVault(root, hiddenFolders)
  -> scan_vault Tauri command
  -> vault_scanner filtered visible tree
  -> vaultStore.tree
```

Calendar flow:

```text
settingsStore.scheduleDir
  -> normalize schedule path
  -> collectScheduleDates(vaultStore.tree, scheduleDir)
  -> CalendarPopover scheduleDates
```

Layout flow:

```text
localStorage layout widths
  -> App layout state
  -> Sidebar / OutlineDrawer inline width
  -> resize handle pointer drag
  -> clamped width state
  -> localStorage
```

## Edge Cases

- Empty hidden rule input is ignored.
- Duplicate hidden rules collapse to one normalized rule.
- Leading or trailing slashes in hidden rules are ignored.
- Backslashes are treated as path separators.
- Built-in hidden folder names cannot be added through Settings.
- Built-in hidden folders stay hidden even if no user hidden rules are set.
- Nested schedule directories work when all parent folders are visible.
- If a user hides a parent of the configured schedule folder, calendar dots for
  that hidden schedule folder disappear because the visible tree no longer
  contains it.
- Header controls must remain clickable and must not start a window drag.
- Resize handles must not open files, focus the editor, or select editor text.
- Pane width persistence failure should be ignored; the in-memory width still
  updates for the current session.

## Testing

Rust tests should cover:

- `.claude` is visible by default.
- `.margin`, `.obsidian`, `.git`, and `.trash` are hidden by default.
- A name rule hides matching folders at multiple levels.
- A relative-path rule hides only the matching relative path.
- Hidden rules do not hide files directly.

Renderer tests should cover:

- Hidden rule normalization, deduplication, and built-in hidden rejection.
- Project config hydration accepts a hidden folder string array.
- `collectScheduleDates` works for top-level `日程/2026-06-14.md`.
- `collectScheduleDates` works for nested `Plans/日程/2026-06-14.md`.
- `collectScheduleDates` ignores nested descendants such as
  `Plans/日程/archive/2026-06-14.md`.
- `collectScheduleDates` handles scheduleDir values with whitespace or slashes.
- Layout width clamp helpers keep left and right pane widths inside bounds.
- Layout width loading falls back to defaults when localStorage data is missing
  or invalid.

Manual verification should cover:

- Open a vault containing `.claude`; confirm it appears in the file library.
- Confirm `.margin`, `.obsidian`, `.git`, and `.trash` do not appear.
- Add `.claude` to hidden folders in Settings; confirm it disappears after
  rescan and persists after app reload.
- Add a relative path such as `Projects/archive`; confirm only that folder is
  hidden.
- Configure `scheduleDir` as `Plans/日程`, create or place
  `2026-06-14.md` there, and confirm the calendar shows a red dot for
  2026-06-14.
- Drag the title bar's empty space and confirm the whole window moves.
- Click title-bar buttons and confirm they do not start a window drag.
- Drag the file-library resize handle and confirm the left pane resizes and the
  width is restored after reload.
- Open the outline drawer, drag its left resize handle, and confirm the drawer
  resizes and the width is restored after reload.

## Risks

- The file watcher still watches the whole root recursively. Hidden folders may
  still trigger rescan events even though they are not visible. This is
  acceptable for this change because visibility is a scanner concern, not a
  watcher-scope change.
- Existing hidden-folder UI changes are in `SettingsPanel`, which already has
  unrelated local modifications in the worktree. Implementation must preserve
  those user changes.
- Any code path that directly calls `api.scanVault` instead of the new helper can
  miss the current hidden-folder rules. Implementation should update all known
  call sites and search for remaining direct calls.
- Resizable panes touch the same `App.tsx` layout that already coordinates
  sidebar, outline drawer, calendar, and settings state. Implementation should
  keep the width logic small and avoid moving unrelated app state into a new
  store.
