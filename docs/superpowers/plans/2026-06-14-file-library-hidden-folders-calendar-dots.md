# File Library Hidden Folders and Calendar Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show normal dot folders, support user hidden-folder rules, fix nested schedule calendar dots, and add title-bar window movement plus resizable side panes.

**Architecture:** Rust owns the final visible file tree by filtering built-in and user-hidden folders during vault scanning. The renderer owns settings input, project config persistence, schedule path lookup, scan helper wiring, and local layout width persistence. Layout resizing stays local to `App`/pane components with small testable helpers.

**Tech Stack:** Tauri 2 Rust commands, React 18, Zustand, TypeScript, Vitest, Rust unit tests.

---

## File Structure

- Modify `src-tauri/src/vault_scanner.rs`: add built-in hidden folders, normalize hidden rules, filter folders during recursive scanning, and add Rust tests.
- Modify `src-tauri/src/commands.rs`: accept `hidden_folders: Vec<String>` in `scan_vault` and pass it to the scanner.
- Modify `src/shared/ipc.ts`: update `MarginApi.scanVault(root, hiddenFolders)`.
- Modify `src/renderer/src/lib/api.ts`: invoke `scan_vault` with `{ root, hidden_folders: hiddenFolders }`.
- Create `src/renderer/src/lib/folderRules.ts`: front-end normalization and built-in hidden folder helpers.
- Create `src/renderer/src/lib/scanVault.ts`: `scanVaultWithSettings(root)` helper.
- Modify `src/renderer/src/stores/settingsStore.ts`: add `hiddenFolders`, actions, sanitization, and project config persistence.
- Modify `src/renderer/src/hooks/useProjectConfig.ts`: existing subscription persists the expanded project config automatically; no new hook shape.
- Modify `src/renderer/src/hooks/useVaultWatch.ts`: use `scanVaultWithSettings`.
- Modify `src/renderer/src/lib/schedule.ts`: normalize schedule directory and find nested folder paths.
- Modify `src/renderer/src/App.tsx`: use scan helper, rescan when hidden rules change, normalize schedule directory, add resize state/handles, keep title bar drag region.
- Modify `src/renderer/src/components/SettingsPanel.tsx`: add hidden-folder Settings UI.
- Modify `src/renderer/src/components/FileTree/Sidebar.tsx`: accept a `width` prop instead of hard-coded `--sidebar-w`.
- Modify `src/renderer/src/components/OutlineDrawer.tsx`: accept a `width` prop.
- Create `src/renderer/src/lib/layout.ts`: pane width constants, clamp, load, and persist helpers.
- Modify `test/projectConfig.test.ts`: settings config and hidden-rule tests.
- Modify `test/useProjectConfig.test.tsx`: hidden-folder hydration/persistence tests.
- Modify `test/schedule.test.ts`: nested schedule folder tests.
- Create `test/layout.test.ts`: layout width helper tests.

### Task 1: Backend Visible Tree Filtering

**Files:**
- Modify: `src-tauri/src/vault_scanner.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add failing Rust scanner tests**

Add tests inside `src-tauri/src/vault_scanner.rs`:

```rust
#[test]
fn scan_shows_normal_dot_dirs_but_hides_built_ins() {
    let root = test_root("__margin_scan_dot_dirs__");
    std::fs::create_dir_all(root.join(".claude")).unwrap();
    std::fs::write(root.join(".claude").join("note.md"), "x").unwrap();
    for name in [".margin", ".obsidian", ".git", ".trash"] {
        std::fs::create_dir_all(root.join(name)).unwrap();
        std::fs::write(root.join(name).join("hidden.md"), "x").unwrap();
    }

    let result = scan_vault(root.to_str().unwrap(), &[]);
    let names: Vec<_> = result.iter().map(|n| n.name.as_str()).collect();
    assert!(names.contains(&".claude"));
    assert!(!names.contains(&".margin"));
    assert!(!names.contains(&".obsidian"));
    assert!(!names.contains(&".git"));
    assert!(!names.contains(&".trash"));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn scan_applies_name_and_relative_path_hidden_rules() {
    let root = test_root("__margin_scan_hidden_rules__");
    std::fs::create_dir_all(root.join("A").join(".claude")).unwrap();
    std::fs::create_dir_all(root.join("B").join(".claude")).unwrap();
    std::fs::create_dir_all(root.join("Projects").join("archive")).unwrap();
    std::fs::create_dir_all(root.join("Other").join("archive")).unwrap();
    std::fs::write(root.join("Projects").join("archive").join("note.md"), "x").unwrap();
    std::fs::write(root.join("Other").join("archive").join("note.md"), "x").unwrap();

    let hidden = vec![".claude".to_string(), "Projects/archive".to_string()];
    let result = scan_vault(root.to_str().unwrap(), &hidden);

    let folder = |nodes: &[TreeNode], name: &str| {
        nodes.iter().find(|n| n.node_type == "folder" && n.name == name).unwrap()
    };
    let a = folder(&result, "A");
    assert!(a.children.as_ref().unwrap().iter().all(|n| n.name != ".claude"));
    let b = folder(&result, "B");
    assert!(b.children.as_ref().unwrap().iter().all(|n| n.name != ".claude"));
    let projects = folder(&result, "Projects");
    assert!(projects.children.as_ref().unwrap().iter().all(|n| n.name != "archive"));
    let other = folder(&result, "Other");
    assert!(other.children.as_ref().unwrap().iter().any(|n| n.name == "archive"));

    let _ = std::fs::remove_dir_all(root);
}
```

Also add the helper in the test module:

```rust
fn test_root(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(name);
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}
```

- [ ] **Step 2: Run Rust tests and verify failure**

Run:

```bash
cd src-tauri && cargo test vault_scanner
```

Expected: compile failure because `scan_vault` still takes one argument, or test failure because `.claude` is still skipped.

- [ ] **Step 3: Implement scanner filtering**

In `src-tauri/src/vault_scanner.rs`, replace the one-argument scanner with this shape:

```rust
const BUILT_IN_HIDDEN_DIRS: &[&str] = &[".margin", ".obsidian", ".git", ".trash"];

#[derive(Default)]
struct HiddenFolderRules {
    names: Vec<String>,
    paths: Vec<String>,
}

fn normalize_rule(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let trimmed = normalized.trim_matches('/').trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn hidden_rules(raw: &[String]) -> HiddenFolderRules {
    let mut rules = HiddenFolderRules::default();
    for value in raw {
        let Some(rule) = normalize_rule(value) else { continue };
        if rule.contains('/') {
            if !rules.paths.contains(&rule) {
                rules.paths.push(rule);
            }
        } else if !rules.names.contains(&rule) {
            rules.names.push(rule);
        }
    }
    rules
}

fn should_hide_dir(name: &str, relative_path: &str, rules: &HiddenFolderRules) -> bool {
    BUILT_IN_HIDDEN_DIRS.contains(&name)
        || rules.names.iter().any(|rule| rule == name)
        || rules.paths.iter().any(|rule| rule == relative_path)
}

pub fn scan_vault(root: &str, hidden_folders: &[String]) -> Vec<TreeNode> {
    let root_path = Path::new(root);
    let rules = hidden_rules(hidden_folders);
    scan_dir(root_path, root_path, &rules)
}

fn scan_dir(root_path: &Path, current_path: &Path, rules: &HiddenFolderRules) -> Vec<TreeNode> {
    let entries = match fs::read_dir(current_path) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut folders: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for entry in entries.flatten() {
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };
        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let relative_path = path
                .strip_prefix(root_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if should_hide_dir(&name, &relative_path, rules) {
                continue;
            }
            folders.push(TreeNode {
                name,
                path: path_str.clone(),
                node_type: "folder".to_string(),
                children: Some(scan_dir(root_path, &path, rules)),
            });
        } else if file_type.is_file() && is_markdown(&name) {
            files.push(TreeNode {
                name,
                path: path_str,
                node_type: "file".to_string(),
                children: None,
            });
        }
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    folders.extend(files);
    folders
}
```

In `src-tauri/src/commands.rs`, change:

```rust
pub fn scan_vault(
    root: String,
    hidden_folders: Vec<String>,
    app: tauri::AppHandle,
    watcher_manager: State<'_, WatcherManager>,
) -> Result<Vec<TreeNode>, String> {
    assert_safe_path(&root)?;
    let new_watcher = file_watcher::start_watching(&root, app)?;
    let mut guard = watcher_manager
        .0
        .lock()
        .map_err(|e| format!("Watcher lock poisoned: {}", e))?;
    *guard = Some(new_watcher);
    Ok(vault_scanner::scan_vault(&root, &hidden_folders))
}
```

- [ ] **Step 4: Run Rust tests and verify pass**

Run:

```bash
cd src-tauri && cargo test vault_scanner
```

Expected: all `vault_scanner` tests pass.

### Task 2: Frontend Folder Rules and Settings Persistence

**Files:**
- Create: `src/renderer/src/lib/folderRules.ts`
- Modify: `src/renderer/src/stores/settingsStore.ts`
- Modify: `test/projectConfig.test.ts`
- Modify: `test/useProjectConfig.test.tsx`

- [ ] **Step 1: Write failing hidden-folder settings tests**

In `test/projectConfig.test.ts`, add imports:

```ts
import { normalizeHiddenFolderRules } from '@/lib/folderRules'
```

Add tests:

```ts
describe('hidden folder rules', () => {
  it('normalizes names and relative paths', () => {
    expect(normalizeHiddenFolderRules([' .claude ', '/Projects/archive/', 'A\\B', '', '.claude'])).toEqual([
      '.claude',
      'Projects/archive',
      'A/B'
    ])
  })

  it('drops built-in hidden folders from user rules', () => {
    expect(normalizeHiddenFolderRules(['.margin', '.obsidian', '.git', '.trash', '.claude'])).toEqual([
      '.claude'
    ])
  })
})
```

Update existing expectations:

```ts
expect(sanitizeProjectConfig({
  scheduleEnabled: false,
  scheduleDir: 'Daily',
  hiddenFolders: [' .claude ', 'Projects/archive']
})).toEqual({
  scheduleEnabled: false,
  scheduleDir: 'Daily',
  hiddenFolders: ['.claude', 'Projects/archive']
})

expect(projectConfigOf({
  scheduleEnabled: true,
  scheduleDir: '日程',
  hiddenFolders: ['.claude']
})).toEqual({
  scheduleEnabled: true,
  scheduleDir: '日程',
  hiddenFolders: ['.claude']
})
```

In `test/useProjectConfig.test.tsx`, reset store with `hiddenFolders: []`, hydrate config with `hiddenFolders: ['.claude']`, and expect writes to include the array:

```ts
useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程', hiddenFolders: [] })
```

```ts
readProjectConfig.mockResolvedValue(
  JSON.stringify({ scheduleEnabled: false, scheduleDir: 'Daily', hiddenFolders: ['.claude'] })
)
```

```ts
expect(useSettingsStore.getState().hiddenFolders).toEqual(['.claude'])
```

```ts
expect(JSON.parse(json)).toEqual({
  scheduleEnabled: true,
  scheduleDir: 'Notes',
  hiddenFolders: []
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run test/projectConfig.test.ts test/useProjectConfig.test.tsx
```

Expected: failures because `folderRules.ts` and `hiddenFolders` do not exist.

- [ ] **Step 3: Implement folder rule helpers and settings state**

Create `src/renderer/src/lib/folderRules.ts`:

```ts
export const BUILT_IN_HIDDEN_FOLDERS = ['.margin', '.obsidian', '.git', '.trash'] as const

const builtIn = new Set<string>(BUILT_IN_HIDDEN_FOLDERS)

export function normalizeFolderPathInput(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
}

export function isBuiltInHiddenFolderRule(rule: string): boolean {
  const normalized = normalizeFolderPathInput(rule)
  return normalized !== '' && normalized.split('/').some((segment) => builtIn.has(segment))
}

export function normalizeHiddenFolderRules(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = normalizeFolderPathInput(value)
    if (!normalized || isBuiltInHiddenFolderRule(normalized)) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}
```

Modify `src/renderer/src/stores/settingsStore.ts`:

```ts
import { normalizeFolderPathInput, normalizeHiddenFolderRules } from '@/lib/folderRules'
```

Add to `Settings`:

```ts
hiddenFolders: string[]
```

Update `projectConfigOf`:

```ts
export function projectConfigOf(s: Settings): Settings {
  return {
    scheduleEnabled: s.scheduleEnabled,
    scheduleDir: s.scheduleDir,
    hiddenFolders: normalizeHiddenFolderRules(s.hiddenFolders)
  }
}
```

Update `sanitizeProjectConfig`:

```ts
const hiddenFolders = normalizeHiddenFolderRules(obj.hiddenFolders)
if (hiddenFolders.length > 0 || Array.isArray(obj.hiddenFolders)) {
  out.hiddenFolders = hiddenFolders
}
```

Update defaults:

```ts
const DEFAULTS: Settings = {
  scheduleEnabled: true,
  scheduleDir: '日程',
  hiddenFolders: []
}
```

Add actions:

```ts
setHiddenFolders(rules: string[]): void
addHiddenFolder(rule: string): void
removeHiddenFolder(rule: string): void
```

Implement actions:

```ts
setHiddenFolders: (rules) => {
  const hiddenFolders = normalizeHiddenFolderRules(rules)
  set({ hiddenFolders })
  persist({ ...get(), hiddenFolders })
},
addHiddenFolder: (rule) => {
  const normalized = normalizeFolderPathInput(rule)
  if (!normalized) return
  const hiddenFolders = normalizeHiddenFolderRules([...get().hiddenFolders, normalized])
  set({ hiddenFolders })
  persist({ ...get(), hiddenFolders })
},
removeHiddenFolder: (rule) => {
  const normalized = normalizeFolderPathInput(rule)
  const hiddenFolders = get().hiddenFolders.filter((value) => value !== normalized)
  set({ hiddenFolders })
  persist({ ...get(), hiddenFolders })
},
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
npx vitest run test/projectConfig.test.ts test/useProjectConfig.test.tsx
```

Expected: both tests pass.

### Task 3: Schedule Nested Path Lookup

**Files:**
- Modify: `src/renderer/src/lib/schedule.ts`
- Modify: `test/schedule.test.ts`

- [ ] **Step 1: Write failing schedule tests**

Extend `test/schedule.test.ts` tree with:

```ts
{
  name: 'Plans',
  path: '/v/Plans',
  type: 'folder',
  children: [
    {
      name: '日程',
      path: '/v/Plans/日程',
      type: 'folder',
      children: [
        { name: '2026-06-14.md', path: '/v/Plans/日程/2026-06-14.md', type: 'file' },
        {
          name: 'archive',
          path: '/v/Plans/日程/archive',
          type: 'folder',
          children: [
            { name: '2026-06-15.md', path: '/v/Plans/日程/archive/2026-06-15.md', type: 'file' }
          ]
        }
      ]
    }
  ]
}
```

Add tests:

```ts
it('collects date keys from a nested schedule folder path', () => {
  const dates = collectScheduleDates(tree, 'Plans/日程')
  expect(dates.has('2026-06-14')).toBe(true)
  expect(dates.has('2026-06-15')).toBe(false)
  expect(dates.size).toBe(1)
})

it('normalizes whitespace and slashes in schedule folder paths', () => {
  const dates = collectScheduleDates(tree, ' /Plans\\日程/ ')
  expect(dates.has('2026-06-14')).toBe(true)
})
```

- [ ] **Step 2: Run schedule tests and verify failure**

Run:

```bash
npx vitest run test/schedule.test.ts
```

Expected: nested path tests fail because lookup only checks top-level names.

- [ ] **Step 3: Implement nested path lookup**

In `src/renderer/src/lib/schedule.ts`, import:

```ts
import { normalizeFolderPathInput } from '@/lib/folderRules'
```

Add:

```ts
export function normalizeScheduleDir(dir: string): string {
  return normalizeFolderPathInput(dir)
}

function findFolderByRelativePath(tree: TreeNode[], dir: string): TreeNode | null {
  const normalized = normalizeScheduleDir(dir)
  if (!normalized) return null
  const segments = normalized.split('/').filter(Boolean)
  let current: TreeNode[] = tree
  let found: TreeNode | null = null
  for (const segment of segments) {
    found = current.find((n) => n.type === 'folder' && n.name === segment) ?? null
    if (!found) return null
    current = found.children ?? []
  }
  return found
}
```

Replace folder lookup in `collectScheduleDates`:

```ts
const folder = findFolderByRelativePath(tree, dir)
```

- [ ] **Step 4: Run schedule tests and verify pass**

Run:

```bash
npx vitest run test/schedule.test.ts
```

Expected: all schedule tests pass.

### Task 4: API Scan Helper and Scan Call Sites

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Create: `src/renderer/src/lib/scanVault.ts`
- Modify: `src/renderer/src/hooks/useVaultWatch.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Update API types and helper**

Change `scanVault` in `src/shared/ipc.ts`:

```ts
scanVault(root: string, hiddenFolders: string[]): Promise<TreeNode[]>
```

Change `src/renderer/src/lib/api.ts`:

```ts
scanVault: (root, hiddenFolders) => invoke<TreeNode[]>('scan_vault', {
  root,
  hidden_folders: hiddenFolders
}),
```

Create `src/renderer/src/lib/scanVault.ts`:

```ts
import { api } from '@/lib/api'
import { normalizeHiddenFolderRules } from '@/lib/folderRules'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TreeNode } from '../../../shared/ipc'

export function currentHiddenFolders(): string[] {
  return normalizeHiddenFolderRules(useSettingsStore.getState().hiddenFolders)
}

export function scanVaultWithSettings(root: string): Promise<TreeNode[]> {
  return api.scanVault(root, currentHiddenFolders())
}
```

- [ ] **Step 2: Replace direct scan calls**

In `src/renderer/src/hooks/useVaultWatch.ts`, import and use:

```ts
import { scanVaultWithSettings } from '@/lib/scanVault'
```

```ts
const tree = await scanVaultWithSettings(root)
```

In `src/renderer/src/App.tsx`, import:

```ts
import { scanVaultWithSettings } from '@/lib/scanVault'
import { normalizeScheduleDir } from '@/lib/schedule'
```

Replace every renderer call of `api.scanVault(root)` or `api.scanVault(chosen)` in `App.tsx` with:

```ts
await scanVaultWithSettings(root)
```

or:

```ts
const tree = await scanVaultWithSettings(chosen)
```

Add an effect after `useProjectConfig()`:

```ts
const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)

useEffect(() => {
  if (!vaultRoot) return
  void scanVaultWithSettings(vaultRoot)
    .then((tree) => useVaultStore.getState().setTree(tree))
    .catch(() => {})
}, [vaultRoot, hiddenFolders])
```

Use normalized schedule dir in `openSchedule`:

```ts
const cleanScheduleDir = normalizeScheduleDir(scheduleDir)
const dirPath = `${root}/${cleanScheduleDir || '日程'}`
```

- [ ] **Step 3: Search for remaining direct scan calls**

Run:

```bash
rg -n "api\\.scanVault|scanVault\\(" src/renderer/src src/shared src-tauri/src
```

Expected: renderer direct calls are limited to `src/renderer/src/lib/scanVault.ts` and `src/renderer/src/lib/api.ts`; Rust command/scanner definitions remain.

- [ ] **Step 4: Run typecheck for API wiring**

Run:

```bash
npm run typecheck:web
```

Expected: web typecheck passes.

### Task 5: Settings Panel Hidden Folder UI

**Files:**
- Modify: `src/renderer/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Implement UI state and store bindings**

Add icon import:

```ts
import { X, Search, Folder, Plus, Trash2 } from 'lucide-react'
```

Bind settings:

```ts
const hiddenFolders = useSettingsStore((s) => s.hiddenFolders)
const addHiddenFolder = useSettingsStore((s) => s.addHiddenFolder)
const removeHiddenFolder = useSettingsStore((s) => s.removeHiddenFolder)
const [hiddenInput, setHiddenInput] = useState('')
```

Add helper in component:

```ts
function submitHiddenFolder(): void {
  const value = hiddenInput.trim()
  if (!value) return
  addHiddenFolder(value)
  setHiddenInput('')
}
```

- [ ] **Step 2: Add Settings panel section**

Add this section before "关于":

```tsx
<div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
  <div className={sectionTitle}>文件库</div>
  <div className={`${labelClass} mb-1.5`}>隐藏文件夹</div>
  <div className="flex items-center gap-2">
    <input
      value={hiddenInput}
      onChange={(e) => setHiddenInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submitHiddenFolder()
      }}
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
  <div className={`${descClass} mt-1.5`}>
    不含斜杠按文件夹名隐藏；含斜杠按文件库相对路径隐藏。
  </div>
  <div className="mt-2 flex flex-col gap-1">
    {hiddenFolders.length === 0 ? (
      <div className={descClass}>未配置隐藏文件夹</div>
    ) : (
      hiddenFolders.map((rule) => (
        <div
          key={rule}
          className="flex items-center gap-2 rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate font-[family-name:var(--mono)] text-[12px] text-[color:var(--text-dim)]">
            {rule}
          </span>
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
</div>
```

- [ ] **Step 3: Run web typecheck**

Run:

```bash
npm run typecheck:web
```

Expected: typecheck passes.

### Task 6: Resizable Layout Helpers and UI

**Files:**
- Create: `src/renderer/src/lib/layout.ts`
- Create: `test/layout.test.ts`
- Modify: `src/renderer/src/components/FileTree/Sidebar.tsx`
- Modify: `src/renderer/src/components/OutlineDrawer.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write failing layout tests**

Create `test/layout.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampPaneWidth,
  loadPaneWidth,
  persistPaneWidth,
  LEFT_PANE,
  RIGHT_PANE
} from '@/lib/layout'

describe('layout pane widths', () => {
  beforeEach(() => localStorage.clear())

  it('clamps widths to pane bounds', () => {
    expect(clampPaneWidth(LEFT_PANE, 20)).toBe(LEFT_PANE.min)
    expect(clampPaneWidth(LEFT_PANE, 9999)).toBe(LEFT_PANE.max)
    expect(clampPaneWidth(RIGHT_PANE, 20)).toBe(RIGHT_PANE.min)
    expect(clampPaneWidth(RIGHT_PANE, 9999)).toBe(RIGHT_PANE.max)
  })

  it('loads defaults for missing or invalid storage values', () => {
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.defaultValue)
    localStorage.setItem(LEFT_PANE.storageKey, 'nope')
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.defaultValue)
  })

  it('persists clamped widths', () => {
    persistPaneWidth(LEFT_PANE, 9999)
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.max)
  })
})
```

- [ ] **Step 2: Run layout tests and verify failure**

Run:

```bash
npx vitest run test/layout.test.ts
```

Expected: failure because `src/renderer/src/lib/layout.ts` does not exist.

- [ ] **Step 3: Implement layout helpers**

Create `src/renderer/src/lib/layout.ts`:

```ts
export interface PaneSpec {
  storageKey: string
  defaultValue: number
  min: number
  max: number
}

export const LEFT_PANE: PaneSpec = {
  storageKey: 'margin.layout.leftPaneWidth',
  defaultValue: 244,
  min: 180,
  max: 420
}

export const RIGHT_PANE: PaneSpec = {
  storageKey: 'margin.layout.rightPaneWidth',
  defaultValue: 296,
  min: 220,
  max: 520
}

export function clampPaneWidth(spec: PaneSpec, value: number, viewportWidth = window.innerWidth): number {
  const viewportMax = Math.max(spec.min, Math.min(spec.max, viewportWidth - 360))
  return Math.min(Math.max(Math.round(value), spec.min), viewportMax)
}

export function loadPaneWidth(spec: PaneSpec): number {
  try {
    const raw = localStorage.getItem(spec.storageKey)
    const value = raw == null ? NaN : Number(raw)
    if (!Number.isFinite(value)) return spec.defaultValue
    return clampPaneWidth(spec, value)
  } catch {
    return spec.defaultValue
  }
}

export function persistPaneWidth(spec: PaneSpec, value: number): number {
  const clamped = clampPaneWidth(spec, value)
  try {
    localStorage.setItem(spec.storageKey, String(clamped))
  } catch {
    // Width persistence is best-effort.
  }
  return clamped
}
```

- [ ] **Step 4: Run layout tests and verify pass**

Run:

```bash
npx vitest run test/layout.test.ts
```

Expected: layout tests pass.

- [ ] **Step 5: Wire pane widths and resize handles**

In `Sidebar.tsx`, add prop:

```ts
width: number
```

Use:

```tsx
<aside
  style={{ width }}
  className="flex h-full flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)] pt-[42px]"
>
```

In `OutlineDrawer.tsx`, add prop:

```ts
width: number
```

Use:

```tsx
<aside
  style={{ width }}
  className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]"
>
```

In `App.tsx`, import:

```ts
import { LEFT_PANE, RIGHT_PANE, clampPaneWidth, loadPaneWidth, persistPaneWidth, type PaneSpec } from '@/lib/layout'
```

Add state:

```ts
const [leftPaneWidth, setLeftPaneWidth] = useState(() => loadPaneWidth(LEFT_PANE))
const [rightPaneWidth, setRightPaneWidth] = useState(() => loadPaneWidth(RIGHT_PANE))
```

Add drag helper inside `App`:

```ts
function startPaneResize(
  e: React.PointerEvent,
  spec: PaneSpec,
  initialWidth: number,
  setWidth: (width: number) => void,
  direction: 1 | -1
): void {
  e.preventDefault()
  const startX = e.clientX
  const previousUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  function move(ev: PointerEvent): void {
    const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
    setWidth(next)
  }
  function up(ev: PointerEvent): void {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.style.userSelect = previousUserSelect
    const next = clampPaneWidth(spec, initialWidth + (ev.clientX - startX) * direction)
    setWidth(persistPaneWidth(spec, next))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
```

Render left sidebar and handle:

```tsx
{sidebarOpen && (
  <>
    <Sidebar
      width={leftPaneWidth}
      onOpenFile={handleOpenFile}
      onContextMenu={handleContextMenu}
    />
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => startPaneResize(e, LEFT_PANE, leftPaneWidth, setLeftPaneWidth, 1)}
      className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
    />
  </>
)}
```

Render outline handle and drawer:

```tsx
{drawerOpen && path && (
  <>
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => startPaneResize(e, RIGHT_PANE, rightPaneWidth, setRightPaneWidth, -1)}
      className="relative z-20 w-[5px] flex-none cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[color:var(--accent-line)] [-webkit-app-region:no-drag]"
    />
    <OutlineDrawer width={rightPaneWidth} onJumpToLine={handleJumpToLine} />
  </>
)}
```

Keep the existing header class with `[-webkit-app-region:drag]` and interactive button groups with `[-webkit-app-region:no-drag]`.

- [ ] **Step 6: Run layout and web checks**

Run:

```bash
npx vitest run test/layout.test.ts
npm run typecheck:web
```

Expected: tests and typecheck pass.

### Task 7: Final Verification

**Files:**
- All changed files from earlier tasks.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx vitest run test/projectConfig.test.ts test/useProjectConfig.test.tsx test/schedule.test.ts test/layout.test.ts
cd src-tauri && cargo test vault_scanner
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: typecheck and Vitest suite pass.

- [ ] **Step 3: Search for direct scan bypass**

Run:

```bash
rg -n "api\\.scanVault|scanVault\\(" src/renderer/src src/shared src-tauri/src
```

Expected: direct renderer scanning appears only in `lib/api.ts` and `lib/scanVault.ts`; Rust definitions remain expected.

- [ ] **Step 4: Manual app verification**

Run:

```bash
npm run dev
```

Expected:

- A vault containing `.claude` shows `.claude`.
- `.margin`, `.obsidian`, `.git`, and `.trash` stay hidden.
- Adding `.claude` in Settings hides it and persists after reload.
- `Projects/archive` hides only that relative path.
- `Plans/日程/2026-06-14.md` creates a calendar red dot for 2026-06-14.
- Dragging title-bar empty space moves the window.
- Dragging left and right pane handles changes widths and persists after reload.
