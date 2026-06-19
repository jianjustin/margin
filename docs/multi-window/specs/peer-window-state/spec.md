## ADDED Requirements

### Requirement: Independent tab management per window

Each window SHALL maintain its own independent set of open document tabs, active path, and tab-specific state (content, save status, epoch, conflict).

#### Scenario: Tabs are isolated between windows

- **WHEN** window A has tabs [file-a.md, file-b.md] and active tab is file-a.md
- **AND** window B has tabs [file-c.md] and active tab is file-c.md
- **THEN** opening or closing a tab in window A does not affect the tabs in window B
- **AND** changing the active tab in window A does not affect the active tab in window B

#### Scenario: Editing same file in two windows does not share undo history

- **WHEN** window A and window B both have file-x.md open in their respective tabs
- **AND** user edits file-x.md in window A
- **THEN** the content of file-x.md in window B's tab does not change (until saved and synced via cross-window event)

### Requirement: Independent sidebar and panel state per window

Each window SHALL independently manage its sidebar visibility, outline drawer visibility, backlinks panel visibility, and resizable pane widths.

#### Scenario: Sidebar state is per-window

- **WHEN** user hides the sidebar in window A (Cmd+B)
- **THEN** the sidebar in window B is unaffected
- **AND** the sidebar hide/show state persists only within each window's runtime

### Requirement: Independent file tree selection and expansion per window

Each window SHALL maintain its own selected path and expanded folder set in the file tree sidebar.

#### Scenario: Tree selection is per-window

- **WHEN** user selects folder-x in the file tree of window A
- **AND** user selects folder-y in the file tree of window B
- **THEN** window A's file tree shows folder-x as selected
- **AND** window B's file tree shows folder-y as selected

### Requirement: Independent vault root per window

Each window MAY open a different vault root. A window SHALL only respond to file change events from its own vault root.

#### Scenario: Two windows with different vaults

- **WHEN** window A opens vault at `/Users/alice/notes`
- **AND** window B opens vault at `/Users/alice/work`
- **THEN** window A's file tree displays the contents of `/Users/alice/notes`
- **AND** window B's file tree displays the contents of `/Users/alice/work`
- **AND** file changes in `/Users/alice/notes` only trigger tree refresh and conflict checks in window A

#### Scenario: Two windows with the same vault

- **WHEN** window A and window B both open vault at `/Users/alice/notes`
- **THEN** both windows display the same file tree
- **AND** file changes in the vault trigger tree refresh and conflict checks in both windows

### Requirement: Complete feature parity across windows

Every window SHALL have access to all Margin features including: file tree sidebar, document tabs, editor (CodeMirror), slash menu, outline drawer, backlinks panel, calendar popover, settings panel, search overlay, theme toggle, status bar, and all keyboard shortcuts.

#### Scenario: All features available in every window

- **WHEN** a new window is created
- **THEN** the window contains the full App layout including header, sidebar toggle, toolbar buttons, and status bar
- **AND** all keyboard shortcuts (Cmd+B, Cmd+\\, Cmd+,, Cmd+K) work identically to the original window
