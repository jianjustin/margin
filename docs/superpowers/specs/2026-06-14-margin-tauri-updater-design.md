# Margin Tauri Updater Design

## Context

Margin is now a Tauri 2 desktop app with a React renderer. The current update
planning document in `docs/superpowers/plans/2026-06-07-auto-updater.md`
targets the previous Electron architecture and must not be implemented as-is.
The live app exposes native operations through `src/renderer/src/lib/api.ts`,
which wraps Tauri `invoke` and `listen` APIs behind the shared `MarginApi`
interface in `src/shared/ipc.ts`.

This feature adds a manual update flow that checks GitHub Releases for the
latest signed Tauri updater artifact, downloads it, installs it, and relaunches
Margin. It does not add startup auto-checking, background auto-downloads, or
GitHub Actions release automation.

## Goals

- Add a manual "check for updates" flow in Margin settings.
- Use Tauri 2's official updater plugin with GitHub Releases
  `latest.json` as the update source.
- Let users explicitly start both the check and the install/relaunch step.
- Keep updater state isolated from editor, vault, and file-tree state.
- Provide unit and DOM coverage for API wrappers, state transitions, and
  settings UI behavior.

## Non-Goals

- Do not revive Electron updater code or preload IPC channels.
- Do not check for updates automatically on app launch.
- Do not auto-download or auto-install without user action.
- Do not add CI release automation in this change.
- Do not add global banners or editor-surface update prompts.

## User Flow

1. User opens Settings.
2. The About section shows the current app version and a "检查更新" action.
3. User clicks "检查更新".
4. Margin calls the Tauri updater plugin's `check()` API.
5. If no update exists, the About section shows "已是最新版本".
6. If an update exists, the About section shows the target version and an
   "更新并重启" action.
7. User clicks "更新并重启".
8. Margin downloads and installs the update, showing progress when available.
9. After installation completes, Margin calls `relaunch()` so the new version
   starts.
10. If relaunch fails after install, Margin tells the user to restart manually.

## Architecture

The implementation uses the official Tauri updater and process plugins from the
renderer, matching the app's current frontend-owned API wrapper pattern.

### Backend and Configuration

- `src-tauri/Cargo.toml`
  - Add `tauri-plugin-updater`.
  - Add `tauri-plugin-process` if required by the relaunch API used by the
    frontend package.
- `src-tauri/src/main.rs`
  - Initialize `tauri_plugin_updater::Builder::new().build()`.
  - Initialize the process plugin if the selected relaunch API requires it.
- `src-tauri/tauri.conf.json`
  - Set `bundle.createUpdaterArtifacts` to `true`.
  - Configure `plugins.updater.pubkey` with the Tauri updater public key.
  - Configure `plugins.updater.endpoints` with:
    `https://github.com/jianjustin/margin/releases/latest/download/latest.json`.
  - Keep `productName`, `version`, and bundle targets consistent with release
    artifacts.
- `src-tauri/capabilities/default.json`
  - Add `updater:default`.
  - Add `process:default` so the renderer can call `relaunch()`.

The updater public key must be committed in `tauri.conf.json`. If an existing
keypair is not already available, implementation should generate a new Tauri
updater keypair, commit only the public key, and keep the private signing key
outside the repository. The design assumes the GitHub Release is public or the
`latest.json` and artifact URLs are publicly reachable.

### Shared Types

`src/shared/ipc.ts` remains the shared contract location. It should gain update
types and API methods without reintroducing string IPC channels.

Suggested state shape:

```ts
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

`MarginApi` should expose updater methods through the existing `api` object,
for example:

```ts
checkUpdate(): Promise<UpdateCheckResult>
downloadAndInstallUpdate(onProgress: (status: UpdateStatus) => void): Promise<void>
relaunch(): Promise<void>
getCurrentVersion(): Promise<string>
```

The final signatures can be adjusted to match the Tauri plugin API, but callers
should not import plugin APIs directly outside `src/renderer/src/lib/api.ts` and
the updater hook.

### Renderer API Wrapper

`src/renderer/src/lib/api.ts` should wrap:

- `check` from `@tauri-apps/plugin-updater`.
- `downloadAndInstall` or equivalent methods from the returned update object.
- `relaunch` from the process plugin.
- current version retrieval from Tauri's app API or an equivalent stable source.

The wrapper should normalize plugin-specific return values into shared update
types so UI code does not depend on plugin object internals.

### Hook

Create `src/renderer/src/hooks/useUpdater.ts`.

Responsibilities:

- Hold the `UpdateStatus` state.
- Expose `check()` and `install()` actions.
- Prevent concurrent checks or installs.
- Preserve the last available update data while installing.
- Convert thrown plugin errors into `error` state messages.
- If install succeeds but relaunch fails, show an error telling the user to
  restart Margin manually.

The hook should not read or mutate document, vault, settings, or theme stores.

### UI

Update `src/renderer/src/components/SettingsPanel.tsx` in the existing About
section. The section should show:

- Current version.
- "检查更新" in idle, not-available, and error states.
- Disabled checking state while a check is in flight.
- Available version and optional release notes when an update exists.
- "更新并重启" when an update is available.
- Download progress during install when content length is available.
- Short, user-facing error messages.

This keeps the update flow discoverable without interrupting writing. No global
banner, modal, or titlebar indicator is added in this change.

## Data Flow

```text
SettingsPanel click
  -> useUpdater.check()
  -> api.checkUpdate()
  -> @tauri-apps/plugin-updater check()
  -> useUpdater status update
  -> SettingsPanel render

SettingsPanel "更新并重启"
  -> useUpdater.install()
  -> api.downloadAndInstallUpdate(progressCallback)
  -> progressCallback updates downloading status
  -> install complete
  -> api.relaunch()
```

## Error Handling

- Network failure, unavailable GitHub endpoint, invalid `latest.json`, missing
  signatures, signature mismatch, unsupported updater environment, and plugin
  configuration errors all map to `error`.
- The UI should show a concise message and allow another manual check.
- Development mode may report updater unavailable; this should not crash the
  settings panel.
- If the update installs but `relaunch()` fails, show a manual restart message.
- Release notes should be treated as optional plain text. If rendered, they must
  not use raw HTML.

## Release Requirements

Manual publishing must include:

- A version bump kept consistent across `package.json`,
  `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Signed Tauri updater artifacts generated by `tauri build`.
- The matching `.sig` content embedded in `latest.json`.
- A GitHub Release containing `latest.json` and the updater artifact URL used by
  that JSON.

The Tauri static JSON format requires a SemVer `version`, platform-specific
artifact `url`, and platform-specific `signature`. Optional `notes` and
`pub_date` may be included.

## Testing

Automated tests:

- Extend `test/api.test.ts` or add focused tests for update API wrappers by
  mocking `@tauri-apps/plugin-updater`, process relaunch, and version lookup.
- Add `test/useUpdater-dom.test.tsx` for state transitions:
  - idle to checking to not-available
  - idle to checking to available
  - available to downloading to installing to relaunch
  - check failure to error
  - install success plus relaunch failure to manual restart error
- Add or extend a SettingsPanel DOM test to verify About section labels and
  buttons for idle, checking, available, downloading, and error states.

Manual checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Real updater verification after a release exists:
  - Install an older signed Margin build.
  - Publish a newer GitHub Release with valid `latest.json`.
  - Use Settings -> About -> Check Updates.
  - Install and confirm Margin relaunches on the newer version.

## Risks and Constraints

- The real install path cannot be fully verified until a signed release and
  public `latest.json` exist.
- If no existing updater keypair is available, generating one is part of
  implementation setup; the private key must not be committed.
- Missing or wrong updater public key breaks installation even if the UI works.
- Incorrect GitHub asset URLs in `latest.json` can make checks pass but downloads
  fail.
- Version drift across package, Cargo, and Tauri config can confuse both users
  and updater comparison.
- Existing uncommitted Tauri window/capability changes must be preserved during
  implementation and not overwritten.
