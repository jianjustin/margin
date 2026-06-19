## ADDED Requirements

### Requirement: Create new window via keyboard shortcut

The system SHALL create a new fully-functional peer window when the user presses Cmd+Shift+N (macOS) or Ctrl+Shift+N (Windows/Linux).

#### Scenario: User creates window via shortcut

- **WHEN** user presses Cmd+Shift+N and at least one Margin window is open
- **THEN** a new Margin window opens with the same dimensions as the default window (1280×800)
- **AND** the new window displays the empty state ("打开文件夹或文件开始编辑")
- **AND** the new window receives keyboard focus

### Requirement: Create new window from file tree context menu

The system SHALL provide an "在新窗口打开" menu item in the file tree row context menu for Markdown files.

#### Scenario: User opens file in new window from context menu

- **WHEN** user right-clicks a Markdown file node in the file tree and selects "在新窗口打开"
- **THEN** a new Margin window opens
- **AND** the new window automatically scans and opens the vault containing the target file
- **AND** the target file is opened as an active tab in the new window

### Requirement: Window close saves dirty tabs

The system SHALL save all dirty (unsaved) tabs in a window before allowing it to close. If any tab has a conflict or save error, the system SHALL prevent the window from closing and bring the problematic tab into focus.

#### Scenario: Close window with unsaved changes

- **WHEN** user closes a window (Cmd+W or title bar close button) that has one or more tabs with unsaved content
- **THEN** each dirty tab is saved to disk before the window closes
- **AND** if all saves succeed, the window closes normally

#### Scenario: Close window with save error

- **WHEN** user closes a window that has a tab failing to save (network error, disk full, permission denied)
- **THEN** the window remains open
- **AND** the tab with the save error becomes the active tab
- **AND** the user is informed of the save failure

#### Scenario: Close window with unresolved conflict

- **WHEN** user closes a window that has a tab with an unresolved file conflict
- **THEN** the window remains open
- **AND** the conflicting tab becomes the active tab
- **AND** the ConflictBar is visible, prompting the user to resolve the conflict

### Requirement: Last window exits application

The system SHALL exit the application process when the last open window is closed.

#### Scenario: Close last window

- **WHEN** only one Margin window is open and the user closes it (Cmd+W or title bar close button)
- **AND** all dirty tabs in that window save successfully
- **THEN** the Margin application process exits

#### Scenario: Close second-to-last window

- **WHEN** two Margin windows are open and the user closes one of them
- **THEN** that window closes normally
- **AND** the remaining window and the application process continue running

### Requirement: New window is blank by default

The system SHALL NOT automatically restore the vault or open any files when creating a new window via Cmd+Shift+N.

#### Scenario: New window via shortcut starts blank

- **WHEN** user presses Cmd+Shift+N
- **THEN** the new window displays the empty state with the message "打开文件夹或文件开始编辑"
- **AND** no vault is loaded in the new window
- **AND** no tabs are open in the new window

### Requirement: Window from context menu opens target vault

The system SHALL automatically open the vault containing the target file when a new window is created via the "在新窗口打开" context menu action.

#### Scenario: New window from context menu opens vault and file

- **WHEN** user right-clicks a file in the file tree and selects "在新窗口打开"
- **THEN** the new window scans and opens the vault containing that file
- **AND** the target file is opened as an active tab
- **AND** the file tree sidebar displays the vault structure
