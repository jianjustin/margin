## ADDED Requirements

### Requirement: Settings changes broadcast to all windows

The system SHALL broadcast settings changes to all open windows via the `settings-changed` Tauri event. When a window receives this event, it SHALL update its in-memory settings store to match.

#### Scenario: Schedule setting changed in one window

- **WHEN** user enables the schedule feature in window A's settings panel
- **THEN** window B's settings store updates to reflect scheduleEnabled: true
- **AND** window B's toolbar shows the calendar button (if not already showing)

#### Scenario: Hidden folders changed in one window

- **WHEN** user adds a hidden folder rule in window A's settings
- **THEN** window B's file tree refreshes to hide the newly hidden folder
- **AND** both windows use the same hidden folder rules for future vault scans

### Requirement: Theme changes broadcast to all windows

The system SHALL broadcast theme changes to all open windows via the `theme-changed` Tauri event. When a window receives this event, it SHALL apply the new theme immediately.

#### Scenario: Theme toggled in one window

- **WHEN** user cycles the theme in window A from light to dark
- **THEN** window B immediately switches to dark theme
- **AND** both windows' theme stores report the same mode value
- **AND** the theme persists to localStorage for future windows

### Requirement: File save notifications broadcast to all windows

The system SHALL emit a `file-saved` event to all windows immediately after a file is successfully written to disk. Other windows SHALL update the `savedContent` of the corresponding tab (if open) to match the saved content.

#### Scenario: Window A saves file that window B also has open (clean)

- **WHEN** window A saves file-x.md with content "hello world"
- **AND** window B has file-x.md open in a tab with no local edits and savedContent matching the previous disk content
- **THEN** window B's tab for file-x.md updates its savedContent to "hello world"
- **AND** window B does not show a conflict for file-x.md

#### Scenario: Window A saves file that window B also has open (dirty)

- **WHEN** window A saves file-x.md with content "hello world"
- **AND** window B has file-x.md open in a tab with unsaved local edits ("goodbye world")
- **THEN** window B's tab for file-x.md updates its savedContent to "hello world"
- **AND** window B's tab saveStatus becomes dirty (content does not match new savedContent)
- **AND** if window B later attempts to save, the save-before-write check detects the mismatch and triggers a conflict

#### Scenario: Window A saves file not open in window B

- **WHEN** window A saves file-x.md
- **AND** window B does not have file-x.md open in any tab
- **THEN** window B ignores the file-saved event for file-x.md

### Requirement: Path mutation notifications to all windows

The system SHALL emit a `path-mutated` event to all windows after a successful file rename, move, or trash operation. Other windows SHALL immediately update affected open tabs' paths without waiting for the vault-changed watcher event.

#### Scenario: Rename propagated across windows

- **WHEN** window A renames `/vault/old.md` to `/vault/new.md`
- **AND** window B has `/vault/old.md` open in a tab
- **THEN** within 500ms, window B's tab path updates from `/vault/old.md` to `/vault/new.md`
- **AND** window B's file tree eventually reflects the rename (via vault-changed)

#### Scenario: File deleted in one window closes tab in another

- **WHEN** window A moves `/vault/temp.md` to trash
- **AND** window B has `/vault/temp.md` open in a tab
- **THEN** window B's tab for `/vault/temp.md` is closed
- **AND** window B does NOT show a "文件已在外部被删除" alert dialog

#### Scenario: Move across directories propagated

- **WHEN** window A moves `/vault/notes/task.md` to `/vault/archive/task.md`
- **AND** window B has `/vault/notes/task.md` open in a tab
- **THEN** window B's tab path updates from `/vault/notes/task.md` to `/vault/archive/task.md`
- **AND** the tab content and save state are preserved

### Requirement: Vault-changed event filtered by root

The system SHALL only process `vault-changed` events whose payload root matches the current window's vault root. Events for other vaults SHALL be silently ignored by that window.

#### Scenario: Vault change ignored for non-matching window

- **WHEN** a file changes in vault `/Users/alice/notes`
- **AND** window A has vault `/Users/alice/notes` open
- **AND** window B has vault `/Users/alice/work` open
- **THEN** window A rescans its file tree and checks for conflicts
- **AND** window B ignores the `vault-changed` event entirely
