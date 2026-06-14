# Margin Tauri Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual Settings -> About updater flow that checks GitHub Releases, downloads and installs signed Tauri updater artifacts, then relaunches Margin.

**Architecture:** Use Tauri 2's official updater and process plugins from the renderer through the existing `src/renderer/src/lib/api.ts` wrapper. Keep updater state in a focused `useUpdater` hook and render controls through a small About-section component mounted by `SettingsPanel`. Configure GitHub Releases `latest.json` in Tauri config and preserve unrelated dirty workspace files by staging only updater paths.

**Tech Stack:** Tauri 2, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/api/app`, React 18, Vitest, Testing Library, TypeScript, Rust Cargo.

---

## File Map

| Path | Action | Responsibility |
| --- | --- | --- |
| `package.json` | Modify | Add Tauri JS updater/process plugin packages. |
| `package-lock.json` | Modify | npm lock update for new JS packages. |
| `pnpm-lock.yaml` | Modify | pnpm lock update because Tauri config uses pnpm commands. |
| `src-tauri/Cargo.toml` | Modify | Add Rust updater/process plugins. |
| `src-tauri/Cargo.lock` | Modify | Cargo lock update for new Rust plugins. |
| `src-tauri/src/main.rs` | Modify | Initialize updater/process plugins. |
| `src-tauri/tauri.conf.json` | Modify | Enable updater artifacts and configure GitHub Releases endpoint/public key. |
| `src-tauri/capabilities/default.json` | Modify | Allow updater and process plugin commands. |
| `src/shared/ipc.ts` | Modify | Add shared updater result/progress/status types and API methods. |
| `src/renderer/src/lib/api.ts` | Modify | Wrap Tauri updater/process/app plugin APIs behind `MarginApi`. |
| `src/renderer/src/hooks/useUpdater.ts` | Create | Manage manual updater state machine and actions. |
| `src/renderer/src/components/UpdateSection.tsx` | Create | Render Settings About update controls. |
| `src/renderer/src/components/SettingsPanel.tsx` | Modify | Replace About placeholder with `UpdateSection`. |
| `test/api.test.ts` | Modify | Mock updater/process/app APIs and verify wrapper behavior. |
| `test/useUpdater-dom.test.tsx` | Create | Verify updater hook state transitions. |
| `test/updateSection-dom.test.tsx` | Create | Verify About-section UI labels/actions. |

Before starting implementation, run `git status --short`. The current workspace may already contain unrelated edits in `docs/design/DESIGN_SYSTEM.md`, `src-tauri/tauri.conf.json`, `src/renderer/src/App.tsx`, `src-tauri/capabilities/`, and `test/windowChrome.test.ts`. Do not revert them. When committing, stage only paths listed in each task.

---

### Task 1: Add Tauri Updater Dependencies and Native Configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Confirm current dirty state**

Run:

```bash
git status --short
```

Expected: output may include unrelated modified files. Keep this output visible and do not stage unrelated paths later.

- [ ] **Step 2: Install JavaScript plugin packages**

Run:

```bash
npm install @tauri-apps/plugin-updater@^2.10.1 @tauri-apps/plugin-process@^2.3.1
pnpm install --lockfile-only
```

Expected:
- `package.json` includes `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`.
- `package-lock.json` changes.
- `pnpm-lock.yaml` changes.
- No dependency install errors.

- [ ] **Step 3: Install Rust plugin crates**

Run:

```bash
cd src-tauri
cargo add tauri-plugin-updater@2 tauri-plugin-process@2
cd ..
```

Expected:
- `src-tauri/Cargo.toml` includes `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"`.
- `src-tauri/Cargo.lock` changes.
- No Cargo errors.

- [ ] **Step 4: Generate a Tauri updater keypair outside the repository**

Run:

```bash
mkdir -p "$HOME/.config/margin"
pnpm tauri signer generate --ci --write-keys "$HOME/.config/margin/margin-updater.key"
```

Expected:
- The command prints `Your keypair was generated successfully`.
- The command may warn that the key has no password.
- Private key file exists at `$HOME/.config/margin/margin-updater.key`.
- Public key file exists at `$HOME/.config/margin/margin-updater.key.pub`.
- No key file is created inside the repository.

Run:

```bash
git status --short "$HOME/.config/margin/margin-updater.key" "$HOME/.config/margin/margin-updater.key.pub" 2>/dev/null || true
```

Expected: no tracked git status output for the key files. The private key must remain outside git.

- [ ] **Step 5: Capture the generated public key**

Run:

```bash
PUBLIC_KEY="$(tr -d '\n' < "$HOME/.config/margin/margin-updater.key.pub")"
printf '%s\n' "$PUBLIC_KEY"
```

Expected: one long base64-like public key string beginning with `dW50cnVzdGVk`. Copy that exact printed string for the next step.

- [ ] **Step 6: Configure Tauri plugins in `src-tauri/src/main.rs`**

Modify `src-tauri/src/main.rs` so the builder plugin section is:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WatcherManager(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::open_file_dialog,
            commands::open_folder_dialog,
            commands::read_file,
            commands::write_file,
            commands::scan_vault,
            commands::create_note,
            commands::create_folder,
            commands::rename_path,
            commands::trash_path,
            commands::move_path,
            commands::open_path_in_finder,
            commands::ensure_note,
            commands::read_project_config,
            commands::write_project_config,
            commands::write_draft,
            commands::read_draft,
            commands::delete_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}
```

Keep the existing module declarations and imports above `fn main()` unchanged.

- [ ] **Step 7: Configure updater artifacts and GitHub endpoint in `src-tauri/tauri.conf.json`**

Edit `src-tauri/tauri.conf.json` with structured JSON edits. Preserve existing window settings, including any uncommitted window chrome changes. Add `createUpdaterArtifacts` to `bundle`, and add `updater` under `plugins`.

The relevant sections should become the following shape. The `pubkey` value must
be the concrete public key string printed in Step 5:

```text
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "createUpdaterArtifacts": true,
    "icon": [
      "icons/icon.png"
    ]
  },
  "plugins": {
    "shell": {
      "open": true
    },
    "updater": {
      "pubkey": the concrete Step 5 public key string,
      "endpoints": [
        "https://github.com/jianjustin/margin/releases/latest/download/latest.json"
      ]
    }
  }
```

Replace the `pubkey` value with the exact string printed in Step 5. Do not commit the private key.

- [ ] **Step 8: Add Tauri capabilities**

Modify `src-tauri/capabilities/default.json` so the `permissions` array is:

```json
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "shell:allow-open",
    "updater:default",
    "process:default"
  ]
```

Preserve the existing `$schema`, `identifier`, `description`, and `windows` fields.

- [ ] **Step 9: Verify native configuration compiles**

Run:

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected:
- `npm run typecheck` passes.
- `cargo check` passes.

- [ ] **Step 10: Commit dependency and native setup**

Run:

```bash
git add package.json package-lock.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git status --short
git commit -m "feat(updater): configure Tauri updater plugins"
```

Expected:
- Staged paths are only the updater dependency/config paths listed above.
- Commit succeeds.

---

### Task 2: Add Shared Update Types and Renderer API Wrapper

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Modify: `test/api.test.ts`

- [ ] **Step 1: Write failing API wrapper tests**

Replace `test/api.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()
const getVersion = vi.fn()
const check = vi.fn()
const relaunch = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args)
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listen(...args)
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => getVersion()
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => check()
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => relaunch()
}))

import { api } from '@/lib/api'

describe('api command arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue(undefined)
    listen.mockResolvedValue(() => {})
    getVersion.mockResolvedValue('2.0.0')
    check.mockResolvedValue(null)
    relaunch.mockResolvedValue(undefined)
  })

  it('uses Tauri camelCase argument keys for multi-word command params', async () => {
    await api.scanVault('/vault', ['.claude'])
    expect(invoke).toHaveBeenLastCalledWith('scan_vault', {
      root: '/vault',
      hiddenFolders: ['.claude']
    })

    await api.renamePath('/vault/a.md', 'b.md')
    expect(invoke).toHaveBeenLastCalledWith('rename_path', {
      oldPath: '/vault/a.md',
      newName: 'b.md'
    })

    await api.movePath('/vault/a.md', '/vault/Target')
    expect(invoke).toHaveBeenLastCalledWith('move_path', {
      srcPath: '/vault/a.md',
      destDir: '/vault/Target'
    })

    await api.openPathInFinder('/vault/a.md')
    expect(invoke).toHaveBeenLastCalledWith('open_path_in_finder', {
      path: '/vault/a.md'
    })
  })

  it('returns the current app version', async () => {
    await expect(api.getCurrentVersion()).resolves.toBe('2.0.0')
    expect(getVersion).toHaveBeenCalledOnce()
  })

  it('normalizes a no-update result', async () => {
    check.mockResolvedValue(null)

    await expect(api.checkUpdate()).resolves.toEqual({
      available: false,
      currentVersion: '2.0.0'
    })
  })

  it('normalizes an available update and stores it for install', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes',
      downloadAndInstall: vi.fn(async () => {})
    }
    check.mockResolvedValue(update)

    await expect(api.checkUpdate()).resolves.toEqual({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })

    await api.downloadAndInstallUpdate(() => {})
    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('forwards updater download events', async () => {
    const update = {
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadAndInstall: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'Started', data: { contentLength: 100 } })
        onEvent({ event: 'Progress', data: { chunkLength: 40 } })
        onEvent({ event: 'Finished' })
      })
    }
    check.mockResolvedValue(update)
    await api.checkUpdate()

    const events: unknown[] = []
    await api.downloadAndInstallUpdate((event) => events.push(event))

    expect(events).toEqual([
      { event: 'Started', contentLength: 100 },
      { event: 'Progress', chunkLength: 40 },
      { event: 'Finished' }
    ])
  })

  it('throws when install is requested without an available update', async () => {
    check.mockResolvedValue(null)
    await api.checkUpdate()

    await expect(api.downloadAndInstallUpdate(() => {})).rejects.toThrow(
      'No update available to install'
    )
  })

  it('relaunches through the process plugin', async () => {
    await api.relaunch()
    expect(relaunch).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```bash
npx vitest run test/api.test.ts
```

Expected: FAIL because `MarginApi` and `api` do not yet expose updater methods.

- [ ] **Step 3: Add shared update types to `src/shared/ipc.ts`**

Append these types above `export interface MarginApi`:

```ts
export type UpdateCheckResult =
  | { available: false; currentVersion: string }
  | {
      available: true
      currentVersion: string
      version: string
      date?: string
      body?: string
    }

export type UpdateDownloadProgress =
  | { event: 'Started'; contentLength?: number }
  | { event: 'Progress'; chunkLength: number }
  | { event: 'Finished' }

export type UpdateStatus =
  | { state: 'idle'; currentVersion: string }
  | { state: 'checking'; currentVersion: string }
  | { state: 'not-available'; currentVersion: string }
  | {
      state: 'available'
      currentVersion: string
      version: string
      date?: string
      body?: string
    }
  | {
      state: 'downloading'
      currentVersion: string
      version: string
      downloadedBytes: number
      contentLength?: number
      percent?: number
    }
  | { state: 'installing'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string }
```

Then add these methods at the end of `MarginApi`:

```ts
  getCurrentVersion(): Promise<string>
  checkUpdate(): Promise<UpdateCheckResult>
  downloadAndInstallUpdate(
    onProgress: (progress: UpdateDownloadProgress) => void
  ): Promise<void>
  relaunch(): Promise<void>
```

- [ ] **Step 4: Implement updater wrappers in `src/renderer/src/lib/api.ts`**

Update imports at the top:

```ts
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import type {
  MarginApi,
  TreeNode,
  UpdateCheckResult,
  UpdateDownloadProgress
} from '../../../shared/ipc'
```

Add these helpers above `export const api`:

```ts
let pendingUpdate: Update | null = null

function normalizeDownloadEvent(event: DownloadEvent): UpdateDownloadProgress {
  if (event.event === 'Started') {
    return { event: 'Started', contentLength: event.data.contentLength }
  }
  if (event.event === 'Progress') {
    return { event: 'Progress', chunkLength: event.data.chunkLength }
  }
  return { event: 'Finished' }
}
```

Add these methods inside the exported `api` object after `deleteDraft`:

```ts
  getCurrentVersion: () => getVersion(),
  checkUpdate: async (): Promise<UpdateCheckResult> => {
    const currentVersion = await getVersion()
    const update = await check()
    pendingUpdate = update
    if (!update) return { available: false, currentVersion }
    return {
      available: true,
      currentVersion: update.currentVersion || currentVersion,
      version: update.version,
      date: update.date,
      body: update.body
    }
  },
  downloadAndInstallUpdate: async (onProgress): Promise<void> => {
    if (!pendingUpdate) throw new Error('No update available to install')
    const update = pendingUpdate
    await update.downloadAndInstall((event) => onProgress(normalizeDownloadEvent(event)))
    pendingUpdate = null
  },
  relaunch: () => relaunch(),
```

Keep `onVaultChanged` as the final property or add a comma before updater methods as needed so the object remains valid TypeScript.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run test/api.test.ts
npm run typecheck:web
```

Expected: both pass.

- [ ] **Step 6: Commit shared types and API wrapper**

Run:

```bash
git add src/shared/ipc.ts src/renderer/src/lib/api.ts test/api.test.ts
git status --short
git commit -m "feat(updater): add renderer updater API"
```

Expected: commit succeeds with only these three paths staged.

---

### Task 3: Add `useUpdater` State Machine

**Files:**
- Create: `src/renderer/src/hooks/useUpdater.ts`
- Create: `test/useUpdater-dom.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `test/useUpdater-dom.test.tsx`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useUpdater } from '@/hooks/useUpdater'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getCurrentVersion: vi.fn(),
    checkUpdate: vi.fn(),
    downloadAndInstallUpdate: vi.fn(),
    relaunch: vi.fn()
  }
}))

const mockedApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.getCurrentVersion.mockResolvedValue('2.0.0')
  mockedApi.checkUpdate.mockResolvedValue({ available: false, currentVersion: '2.0.0' })
  mockedApi.downloadAndInstallUpdate.mockResolvedValue(undefined)
  mockedApi.relaunch.mockResolvedValue(undefined)
})

describe('useUpdater', () => {
  it('loads the current version into idle state', async () => {
    const { result } = renderHook(() => useUpdater())

    await waitFor(() => {
      expect(result.current.status).toEqual({ state: 'idle', currentVersion: '2.0.0' })
    })
  })

  it('reports no update available', async () => {
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'not-available',
      currentVersion: '2.0.0'
    })
  })

  it('reports an available update', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'available',
      currentVersion: '2.0.0',
      version: '2.1.0',
      date: '2026-06-14T00:00:00Z',
      body: 'Release notes'
    })
  })

  it('downloads, installs, and relaunches an available update', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    mockedApi.downloadAndInstallUpdate.mockImplementation(async (onProgress) => {
      onProgress({ event: 'Started', contentLength: 100 })
      onProgress({ event: 'Progress', chunkLength: 25 })
      onProgress({ event: 'Progress', chunkLength: 75 })
      onProgress({ event: 'Finished' })
    })
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
      await result.current.install()
    })

    expect(mockedApi.downloadAndInstallUpdate).toHaveBeenCalledOnce()
    expect(mockedApi.relaunch).toHaveBeenCalledOnce()
    expect(result.current.status).toEqual({
      state: 'installing',
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
  })

  it('surfaces check errors with the current version', async () => {
    mockedApi.checkUpdate.mockRejectedValue(new Error('network fail'))
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
    })

    expect(result.current.status).toEqual({
      state: 'error',
      currentVersion: '2.0.0',
      message: 'network fail'
    })
  })

  it('reports manual restart when relaunch fails after install', async () => {
    mockedApi.checkUpdate.mockResolvedValue({
      available: true,
      currentVersion: '2.0.0',
      version: '2.1.0'
    })
    mockedApi.relaunch.mockRejectedValue(new Error('restart blocked'))
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.check()
      await result.current.install()
    })

    expect(result.current.status).toEqual({
      state: 'error',
      currentVersion: '2.0.0',
      message: '更新已安装，但无法自动重启。请手动重启 Margin。'
    })
  })
})
```

- [ ] **Step 2: Run hook tests to verify failure**

Run:

```bash
npx vitest run test/useUpdater-dom.test.tsx
```

Expected: FAIL because `src/renderer/src/hooks/useUpdater.ts` does not exist.

- [ ] **Step 3: Implement `src/renderer/src/hooks/useUpdater.ts`**

Create `src/renderer/src/hooks/useUpdater.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { UpdateStatus } from '../../../shared/ipc'

interface UseUpdaterResult {
  status: UpdateStatus
  check: () => Promise<void>
  install: () => Promise<void>
  busy: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function currentVersionOf(status: UpdateStatus): string {
  return status.currentVersion
}

export function useUpdater(): UseUpdaterResult {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' })
  const statusRef = useRef(status)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let cancelled = false
    void api.getCurrentVersion()
      .then((version) => {
        if (!cancelled) setStatus({ state: 'idle', currentVersion: version })
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            state: 'error',
            currentVersion: '',
            message: errorMessage(error)
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const check = useCallback(async (): Promise<void> => {
    const current = currentVersionOf(statusRef.current)
    if (statusRef.current.state === 'checking' || statusRef.current.state === 'downloading') {
      return
    }
    setStatus({ state: 'checking', currentVersion: current })
    try {
      const result = await api.checkUpdate()
      if (!result.available) {
        setStatus({ state: 'not-available', currentVersion: result.currentVersion })
        return
      }
      setStatus({
        state: 'available',
        currentVersion: result.currentVersion,
        version: result.version,
        date: result.date,
        body: result.body
      })
    } catch (error) {
      setStatus({
        state: 'error',
        currentVersion: current,
        message: errorMessage(error)
      })
    }
  }, [])

  const install = useCallback(async (): Promise<void> => {
    const initial = statusRef.current
    if (initial.state !== 'available') return

    let downloadedBytes = 0
    let contentLength: number | undefined

    try {
      setStatus({
        state: 'downloading',
        currentVersion: initial.currentVersion,
        version: initial.version,
        downloadedBytes
      })

      await api.downloadAndInstallUpdate((progress) => {
        if (progress.event === 'Started') {
          contentLength = progress.contentLength
          downloadedBytes = 0
        } else if (progress.event === 'Progress') {
          downloadedBytes += progress.chunkLength
        } else {
          setStatus({
            state: 'installing',
            currentVersion: initial.currentVersion,
            version: initial.version
          })
          return
        }

        setStatus({
          state: 'downloading',
          currentVersion: initial.currentVersion,
          version: initial.version,
          downloadedBytes,
          contentLength,
          percent: contentLength
            ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
            : undefined
        })
      })

      setStatus({
        state: 'installing',
        currentVersion: initial.currentVersion,
        version: initial.version
      })
    } catch (error) {
      setStatus({
        state: 'error',
        currentVersion: initial.currentVersion,
        message: errorMessage(error)
      })
      return
    }

    try {
      await api.relaunch()
    } catch {
      setStatus({
        state: 'error',
        currentVersion: initial.currentVersion,
        message: '更新已安装，但无法自动重启。请手动重启 Margin。'
      })
    }
  }, [])

  const busy = status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'

  return useMemo(() => ({ status, check, install, busy }), [status, check, install, busy])
}
```

- [ ] **Step 4: Run hook verification**

Run:

```bash
npx vitest run test/useUpdater-dom.test.tsx
npm run typecheck:web
```

Expected: both pass.

- [ ] **Step 5: Commit hook and tests**

Run:

```bash
git add src/renderer/src/hooks/useUpdater.ts test/useUpdater-dom.test.tsx
git status --short
git commit -m "feat(updater): add manual updater state hook"
```

Expected: commit succeeds with only hook and hook test staged.

---

### Task 4: Add Settings About Update UI

**Files:**
- Create: `src/renderer/src/components/UpdateSection.tsx`
- Create: `test/updateSection-dom.test.tsx`
- Modify: `src/renderer/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `test/updateSection-dom.test.tsx`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdateSection } from '@/components/UpdateSection'
import type { UpdateStatus } from '../src/shared/ipc'

afterEach(cleanup)

function renderSection(status: UpdateStatus, overrides?: Partial<Parameters<typeof UpdateSection>[0]>): void {
  render(
    <UpdateSection
      status={status}
      busy={status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'}
      onCheck={() => Promise.resolve()}
      onInstall={() => Promise.resolve()}
      {...overrides}
    />
  )
}

describe('UpdateSection', () => {
  it('shows current version and check action in idle state', () => {
    const onCheck = vi.fn()
    renderSection({ state: 'idle', currentVersion: '2.0.0' }, { onCheck })

    expect(screen.getByText('版本 2.0.0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })

  it('shows checking state', () => {
    renderSection({ state: 'checking', currentVersion: '2.0.0' })

    const button = screen.getByRole('button', { name: '正在检查…' })
    expect(button).toBeDisabled()
  })

  it('shows not available state', () => {
    renderSection({ state: 'not-available', currentVersion: '2.0.0' })

    expect(screen.getByText('已是最新版本')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()
  })

  it('shows available update with install action and notes', () => {
    const onInstall = vi.fn()
    renderSection(
      {
        state: 'available',
        currentVersion: '2.0.0',
        version: '2.1.0',
        body: 'Release notes'
      },
      { onInstall }
    )

    expect(screen.getByText('发现新版本 2.1.0')).toBeTruthy()
    expect(screen.getByText('Release notes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '更新并重启' }))
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('shows download progress', () => {
    renderSection({
      state: 'downloading',
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadedBytes: 50,
      contentLength: 100,
      percent: 50
    })

    expect(screen.getByText('正在下载 50%')).toBeTruthy()
  })

  it('shows errors and retry action', () => {
    const onCheck = vi.fn()
    renderSection(
      {
        state: 'error',
        currentVersion: '2.0.0',
        message: 'network fail'
      },
      { onCheck }
    )

    expect(screen.getByText('network fail')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
npx vitest run test/updateSection-dom.test.tsx
```

Expected: FAIL because `UpdateSection` does not exist.

- [ ] **Step 3: Implement `src/renderer/src/components/UpdateSection.tsx`**

Create `src/renderer/src/components/UpdateSection.tsx`:

```tsx
import { Download, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '../../../shared/ipc'

interface UpdateSectionProps {
  status: UpdateStatus
  busy: boolean
  onCheck: () => Promise<void>
  onInstall: () => Promise<void>
}

function actionClass(primary = false): string {
  return [
    'inline-flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
    primary
      ? 'bg-[color:var(--accent)] text-[color:var(--accent-ink)]'
      : 'border border-[color:var(--border-soft)] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
  ].join(' ')
}

function statusText(status: UpdateStatus): string | null {
  switch (status.state) {
    case 'checking':
      return '正在检查…'
    case 'not-available':
      return '已是最新版本'
    case 'available':
      return `发现新版本 ${status.version}`
    case 'downloading':
      return status.percent != null ? `正在下载 ${status.percent}%` : '正在下载更新…'
    case 'installing':
      return '正在安装更新…'
    case 'error':
      return status.message
    case 'idle':
      return null
  }
}

export function UpdateSection({
  status,
  busy,
  onCheck,
  onInstall
}: UpdateSectionProps): JSX.Element {
  const text = statusText(status)
  const version = status.currentVersion || '...'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] text-foreground">版本 {version}</div>
          {text && (
            <div
              className={[
                'mt-1 text-[11.5px]',
                status.state === 'error'
                  ? 'text-[color:var(--red)]'
                  : 'text-[color:var(--text-faint)]'
              ].join(' ')}
            >
              {text}
            </div>
          )}
        </div>

        {(status.state === 'idle' || status.state === 'not-available' || status.state === 'error') && (
          <button
            type="button"
            onClick={() => void onCheck()}
            disabled={busy}
            className={actionClass(false)}
          >
            <RefreshCw size={13} />
            {status.state === 'idle' ? '检查更新' : '重新检查'}
          </button>
        )}

        {status.state === 'checking' && (
          <button type="button" disabled className={actionClass(false)}>
            <RefreshCw size={13} />
            正在检查…
          </button>
        )}

        {status.state === 'available' && (
          <button
            type="button"
            onClick={() => void onInstall()}
            disabled={busy}
            className={actionClass(true)}
          >
            <Download size={13} />
            更新并重启
          </button>
        )}
      </div>

      {status.state === 'available' && status.body && (
        <div className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1.5 text-[11.5px] text-[color:var(--text-dim)]">
          {status.body}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrate `UpdateSection` into SettingsPanel**

In `src/renderer/src/components/SettingsPanel.tsx`, add imports:

```ts
import { UpdateSection } from '@/components/UpdateSection'
import { useUpdater } from '@/hooks/useUpdater'
```

Inside `SettingsPanel`, after local state declarations, add:

```ts
  const updater = useUpdater()
```

Replace the existing About block:

```tsx
          {/* ── 未来扩展占位 ────────── */}
          <div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
            <div className={sectionTitle}>关于</div>
            <div className={`${descClass}`}>
              版本 2.0 · 更多功能设置即将到来
            </div>
            <div className={`${descClass} mt-1.5`}>
              本文件库的设置保存在 <code className="font-[family-name:var(--mono)]">.margin/config.json</code>，随文件库一起迁移。
            </div>
          </div>
```

with:

```tsx
          {/* ── 关于 ───────────────── */}
          <div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
            <div className={sectionTitle}>关于</div>
            <UpdateSection
              status={updater.status}
              busy={updater.busy}
              onCheck={updater.check}
              onInstall={updater.install}
            />
            <div className={`${descClass} mt-2`}>
              本文件库的设置保存在 <code className="font-[family-name:var(--mono)]">.margin/config.json</code>，随文件库一起迁移。
            </div>
          </div>
```

- [ ] **Step 5: Run UI verification**

Run:

```bash
npx vitest run test/updateSection-dom.test.tsx
npm run typecheck:web
```

Expected: both pass.

- [ ] **Step 6: Commit Settings update UI**

Run:

```bash
git add src/renderer/src/components/UpdateSection.tsx src/renderer/src/components/SettingsPanel.tsx test/updateSection-dom.test.tsx
git status --short
git commit -m "feat(updater): add settings update controls"
```

Expected: commit succeeds with only these paths staged.

---

### Task 5: Add Manual Release Notes for Updater Publishing

**Files:**
- Create: `docs/release-updater.md`

- [ ] **Step 1: Create release instructions**

Create `docs/release-updater.md`:

````md
# Updater Release Notes

Margin uses the Tauri 2 updater with a static GitHub Releases manifest:

```text
https://github.com/jianjustin/margin/releases/latest/download/latest.json
```

## Signing Key

The updater public key is committed in `src-tauri/tauri.conf.json`.

The private key is not stored in this repository. The local development key path
used during setup is:

```text
$HOME/.config/margin/margin-updater.key
```

For release builds, set:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.config/margin/margin-updater.key"
```

If the private key is lost, existing installed builds cannot be updated with
newly signed artifacts from a different keypair.

## Manual Release Flow

1. Update the version consistently in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. Run verification:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

3. Find the updater artifacts generated by Tauri under
   `src-tauri/target/release/bundle/macos/`.
4. Create or update a GitHub Release for the new version.
5. Upload the updater bundle and its `.sig` file.
6. Upload `latest.json` to the release as `latest.json`.

## Static Manifest Shape

For macOS, `latest.json` must include the platform key that matches the updater
target generated by Tauri. For a normal macOS build this is typically
`darwin-aarch64` or `darwin-x86_64`.

```json
{
  "version": "2.1.0",
  "notes": "Short release notes shown in Margin settings.",
  "pub_date": "2026-06-14T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "contents of the generated .sig file",
      "url": "https://github.com/jianjustin/margin/releases/download/v2.1.0/Margin.app.tar.gz"
    }
  }
}
```

The `signature` value is the contents of the `.sig` file, not a path or URL.
````

- [ ] **Step 2: Verify docs render as Markdown and contain no private key**

Run:

```bash
rg -n "TAURI_SIGNING_PRIVATE_KEY=|encrypted secret key|dW50cnVzdGVk.*secret" docs/release-updater.md
```

Expected: no output containing a private key value.

- [ ] **Step 3: Commit release docs**

Run:

```bash
git add docs/release-updater.md
git status --short
git commit -m "docs(updater): document manual release flow"
```

Expected: commit succeeds with only `docs/release-updater.md` staged.

---

### Task 6: Final Verification

**Files:**
- No new files unless a prior verification reveals a focused fix.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:
- TypeScript typecheck passes.
- Vitest suite passes.
- Tauri build completes.
- Rust tests pass.

- [ ] **Step 2: Manual app smoke test**

Run:

```bash
npm run dev
```

Expected:
- Tauri app opens.
- Settings opens with `⌘,`.
- About section shows the current version and a "检查更新" button.
- Clicking "检查更新" does not crash the app.
- In development mode, either "已是最新版本" or a concise updater configuration/runtime error is acceptable.

Stop the dev server/app before continuing.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected:
- Remaining dirty files, if any, are either unrelated pre-existing workspace changes or focused fixes from this plan.
- No private signing key file is inside the repository.

- [ ] **Step 4: Commit any focused verification fixes**

If Step 1 or Step 2 required code fixes, stage only the relevant updater files and commit:

```bash
git add src/shared/ipc.ts src/renderer/src/lib/api.ts src/renderer/src/hooks/useUpdater.ts src/renderer/src/components/UpdateSection.tsx src/renderer/src/components/SettingsPanel.tsx test/api.test.ts test/useUpdater-dom.test.tsx test/updateSection-dom.test.tsx src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json package.json package-lock.json pnpm-lock.yaml docs/release-updater.md
git commit -m "fix(updater): address verification issues"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 5: Final report**

Report:
- Files changed.
- Key behavior added.
- Verification commands and results.
- Whether real update installation was verified. If no signed GitHub Release exists yet, state that real install remains unverified.
- Any unrelated workspace changes that were left untouched.
