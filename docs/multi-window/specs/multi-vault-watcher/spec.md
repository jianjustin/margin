## ADDED Requirements

### Requirement: Multiple vault watchers coexist

The Rust backend SHALL support concurrent file watchers for multiple distinct vault roots within the same application process. Each vault's watcher SHALL operate independently.

#### Scenario: Two vaults watched simultaneously

- **WHEN** window A opens vault `/Users/alice/notes`
- **AND** window B opens vault `/Users/alice/work`
- **THEN** the Rust backend maintains two active watchers (one for each vault)
- **AND** file changes in `/Users/alice/notes` emit `vault-changed` with payload `/Users/alice/notes`
- **AND** file changes in `/Users/alice/work` emit `vault-changed` with payload `/Users/alice/work`

### Requirement: Watcher reuse for same vault

When multiple windows open the same vault root, the Rust backend SHALL reuse the existing watcher for that root rather than creating a duplicate.

#### Scenario: Two windows open the same vault

- **WHEN** window A opens vault `/Users/alice/notes` (watcher created)
- **AND** window B also opens vault `/Users/alice/notes`
- **THEN** only one watcher is active for `/Users/alice/notes`
- **AND** file changes in the vault emit a single `vault-changed` event (received by both windows)

### Requirement: Scan triggers watcher creation

The `scan_vault` Tauri command SHALL create a watcher for the vault root if one does not already exist. It SHALL NOT replace an existing watcher for the same root.

#### Scenario: First scan creates watcher

- **WHEN** the first window calls `scan_vault("/Users/alice/notes", hiddenFolders)`
- **AND** no watcher exists for `/Users/alice/notes`
- **THEN** a new file watcher is created and started for that root
- **AND** subsequent FS changes in the vault emit `vault-changed` events

#### Scenario: Second scan reuses watcher

- **WHEN** a second window calls `scan_vault("/Users/alice/notes", hiddenFolders)`
- **AND** a watcher already exists for `/Users/alice/notes`
- **THEN** the existing watcher continues running unchanged
- **AND** the vault tree scan still completes and returns the current tree state

### Requirement: Watcher lifecycle is process-scoped

File watchers SHALL persist for the lifetime of the application process. Closing a window SHALL NOT stop the watcher for its vault unless it was the last watcher for that root and the application is exiting.

#### Scenario: Watcher survives window close

- **WHEN** window A opens vault `/Users/alice/notes`
- **AND** window B also opens vault `/Users/alice/notes`
- **AND** window A is closed
- **THEN** the watcher for `/Users/alice/notes` continues running
- **AND** window B continues to receive `vault-changed` events for that vault

### Requirement: Watcher debounce is per-vault

Each vault watcher SHALL independently debounce FS events at 300ms. Events from different vaults SHALL NOT coalesce.

#### Scenario: Changes in two vaults debounced separately

- **WHEN** a file changes in `/Users/alice/notes` at time T
- **AND** a file changes in `/Users/alice/work` at time T+50ms
- **THEN** both vaults emit their respective `vault-changed` events independently
- **AND** the 300ms debounce timer for each vault runs independently
