# M1 Manual Verification

Date: 2026-05-30
Tester: <fill in>
Vault used: `~/Library/CloudStorage/OneDrive-个人/笔记库`

Check off each item as it passes; record bugs inline.

- [ ] App launches showing "Welcome to Margin" with a Choose Vault button
- [ ] Choosing the vault loads the file tree in the left pane
- [ ] `.obsidian`, `.claude`, and `.trash` (if present) are visible in the file tree
- [ ] Clicking a folder shows its `.md` files in the middle pane
- [ ] Clicking a note loads its content into the right-side editor
- [ ] Editing the note shows the orange dirty dot
- [ ] After ~1s of no typing, the dirty dot disappears (auto-save fired)
- [ ] Reopening the same note shows the saved content
- [ ] Cmd-S saves immediately
- [ ] Cmd-Shift-O reopens the vault picker
- [ ] Quit + relaunch restores: window position, column widths, last vault (no re-pick), last note open
- [ ] Editing the same `.md` from outside (e.g. Obsidian) and switching back to Margin: not yet expected to auto-reload (deferred to M2 file watcher); document the gap

## How to launch

```bash
cd /Users/jianjustin/workspaces/margin
open build/Build/Products/Debug/Margin.app
```

Or rebuild + launch:
```bash
xcodebuild -scheme Margin -configuration Debug -derivedDataPath build/ -destination "platform=macOS" build
open build/Build/Products/Debug/Margin.app
```

## Known limitations (deferred to M2+)

- No Markdown rendering — editor shows raw text only (M3)
- No double links (M4)
- No search (M2)
- No backlinks (M4)
- No tag tree (M5)
- No external-file-change auto-reload (M2)
- macOS Sonoma (14.0) minimum

## Bugs / notes

-
