# Electron → Tauri Migration Design

## Context

Margin is a Typora-style WYSIWYG Markdown editor for Obsidian vaults, currently on Electron 33 + electron-vite. The main process is ~400 lines with 12 IPC channels covering file I/O, vault scanning, file watching, and native dialogs. The frontend (React 18 + CodeMirror 6 + Zustand + Tailwind) is ~3500 lines and remains untouched except for the IPC bridge layer.

## Motivation

- **Preemptive performance**: upcoming backend features (search index, version history, sync) are resource-intensive — Rust handles them better than Node.js
- **Package size**: ~180 MB Electron DMG → ~15 MB Tauri DMG
- **Memory**: ~200-300 MB baseline → ~50-80 MB
- **Timing**: main process is thin now; migration surface grows with every backend feature added

## Migration Scope

### What changes

| Layer | Before (Electron) | After (Tauri) |
|-------|-------------------|---------------|
| Backend runtime | Node.js (main process) | Rust (src-tauri/) |
| IPC mechanism | `ipcRenderer.invoke` / `contextBridge` | `@tauri-apps/api invoke` / `listen` |
| Build tooling | electron-vite + electron-builder | Vite (standard) + Tauri bundler |
| File watcher | Node `fs.watch({ recursive })` | `notify` crate + Tauri events |
| Trash | `electron.shell.trashItem` | `trash` crate |
| Dialogs | `electron.dialog.showOpenDialog` | `tauri::dialog` |
| Menu | `electron.Menu` | `tauri::menu` (or Tauri config) |
| Window chrome | `titleBarStyle: 'hiddenInset'` | Tauri window config `decorations: false` + custom title bar |

### What stays the same

- All React components, hooks, stores
- All CodeMirror editor logic (livePreview, decorationSpecs, widgets)
- All CSS / Tailwind / theme system
- Shared types (`TreeNode`, `MarginApi` interface shape)
- Test suite (vitest, all renderer-side tests)

## Architecture

```
margin/
├── src-tauri/                 # NEW: Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs            # Tauri entry, window config, menu
│   │   ├── commands.rs        # All 12 IPC command handlers
│   │   ├── vault_scanner.rs   # Port of vaultScanner.ts
│   │   ├── file_watcher.rs    # Port of fileWatcher.ts (notify crate)
│   │   ├── fs_ops.rs          # Port of fsOps.ts
│   │   └── path_policy.rs     # Port of pathPolicy.ts
│   └── icons/
├── src/
│   ├── renderer/              # UNCHANGED (except API bridge)
│   │   └── src/
│   │       ├── lib/
│   │       │   └── api.ts     # NEW: Tauri invoke wrapper replacing preload
│   │       └── ... (all existing components)
│   └── shared/
│       └── ipc.ts             # MODIFIED: keep types, remove IPC constants
├── vite.config.ts             # NEW: standard Vite config (replaces electron.vite.config.ts)
└── package.json               # MODIFIED: remove electron deps, add @tauri-apps/*
```

## Rust Command Mapping

Each existing IPC handler maps 1:1 to a Tauri command:

| IPC Channel | Tauri Command | Implementation |
|-------------|--------------|----------------|
| `dialog:openFile` | `open_file_dialog` | `tauri::dialog::FileDialogBuilder` with md filter |
| `dialog:openFolder` | `open_folder_dialog` | `tauri::dialog::FileDialogBuilder::pick_folder` |
| `file:read` | `read_file` | `std::fs::read_to_string` + path policy check |
| `file:write` | `write_file` | `std::fs::write` + path policy check |
| `vault:scan` | `scan_vault` | Recursive `std::fs::read_dir`, returns `Vec<TreeNode>` |
| `file:create` | `create_note` | `unique_path` + `std::fs::write` |
| `folder:create` | `create_folder` | `unique_path` + `std::fs::create_dir` |
| `path:rename` | `rename_path` | `unique_path` + `std::fs::rename` |
| `path:trash` | `trash_path` | `trash::delete` crate |
| `path:move` | `move_path` | `std::fs::create_dir_all` + `std::fs::rename` |
| `note:ensure` | `ensure_note` | Check exists + create if missing |
| `vault:changed` | (event) | `notify::Watcher` → `app.emit("vault-changed", root)` |

## Frontend API Bridge

Replace `src/preload/index.ts` (electron contextBridge) with `src/renderer/src/lib/api.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { MarginApi, TreeNode } from '../../shared/ipc'

export const api: MarginApi = {
  openFile: () => invoke<string | null>('open_file_dialog'),
  openFolder: () => invoke<string | null>('open_folder_dialog'),
  readFile: (path) => invoke<string>('read_file', { path }),
  writeFile: (path, content) => invoke<void>('write_file', { path, content }),
  scanVault: (root) => invoke<TreeNode[]>('scan_vault', { root }),
  createNote: (dir, name) => invoke<string>('create_note', { dir, name }),
  createFolder: (dir, name) => invoke<string>('create_folder', { dir, name }),
  renamePath: (oldPath, newName) => invoke<string>('rename_path', { oldPath, newName }),
  trashPath: (path) => invoke<void>('trash_path', { path }),
  movePath: (srcPath, destDir) => invoke<string>('move_path', { srcPath, destDir }),
  ensureNote: (dir, name, template) => invoke<string>('ensure_note', { dir, name, template: template ?? '' }),
  onVaultChanged: (callback) => {
    let unlisten: (() => void) | null = null
    listen<string>('vault-changed', (event) => callback(event.payload))
      .then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }
}
```

All existing `window.margin.*` calls in components are replaced with imports from this module.

## Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["dialog-open", "shell-open"] }
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
notify = "7"
trash = "5"
```

## Frontend Changes Required

1. **Remove**: `src/preload/index.ts` (electron contextBridge)
2. **Remove**: `electron.vite.config.ts`
3. **Add**: `vite.config.ts` (standard Vite with React plugin + `@` alias)
4. **Add**: `src/renderer/src/lib/api.ts` (Tauri invoke wrapper)
5. **Modify**: all files that reference `window.margin` → import from `api.ts`
6. **Modify**: `package.json` — remove electron/electron-builder/electron-vite, add `@tauri-apps/api`, `@tauri-apps/cli`
7. **Modify**: `src/renderer/src/env.d.ts` — remove `Window.margin` declaration

## Files referencing `window.margin`

Need to grep and update all usages to import from the new api module.

## Build & Dev

- `pnpm tauri dev` — starts Vite dev server + Rust backend with HMR
- `pnpm tauri build` — produces DMG (macOS), MSI (Windows), AppImage (Linux)
- Rust backend recompiles on change (~2-5s incremental)

## Risk Mitigation

- **Tag created**: `electron-v2.0.0` preserves the pre-migration state
- **Frontend tests**: all vitest tests remain valid (they don't depend on Electron)
- **Incremental verification**: Rust commands can be tested individually via `cargo test`
- **Fallback**: if migration stalls, `git checkout electron-v2.0.0` restores full working state

## Out of Scope

- Multi-window support (not currently implemented in Electron version either)
- Linux/Windows packaging (can be added later via tauri.conf.json targets)
- Tauri plugin system (future concern)
