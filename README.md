# Margin

> A WYSIWYG Markdown editor for Obsidian vaults — Bear-like typography, Obsidian-compatible data model.

Built on **Tauri v2** + **React** + **TypeScript** (Vite), Tailwind CSS, Zustand, and CodeMirror 6.

[中文文档](README.zh.md)

---

## About

**Margin** is a native macOS Markdown editor designed for users who manage their notes as [Obsidian](https://obsidian.md) vaults. Unlike Electron-based alternatives, Margin is built on Tauri v2 for a lightweight, native-feeling experience.

### Why Margin?

- **Edit directly on Obsidian vaults** — no import/export, no format conversion. Your `.md` files stay exactly where they are.
- **WYSIWYG with live preview** — write in rich text while editing the underlying Markdown. Tables, code blocks, and YAML frontmatter render as styled blocks inline.
- **Bear-inspired typography** — clean, readable defaults using IBM Plex typefaces.
- **Native performance** — Tauri v2 Rust backend with a React frontend. Smaller binary, lower memory footprint than Electron apps.
- **Multi-window, multi-vault** (v2.3.0) — open different vaults in separate windows, with cross-window settings and theme sync.

---

## Features

- **WYSIWYG Markdown** — live preview with rich block rendering for tables, code blocks, and frontmatter
- **Obsidian-compatible** — wiki links (`[[link]]`), backlinks panel, YAML frontmatter, `.obsidian`-safe
- **File Tree Sidebar** — browse, create, rename, move, and trash notes and folders
- **Document Tabs** — open multiple documents; ⌘S to save, autosave after 800ms idle
- **Multi-Window** — fully-functional peer windows; different vaults per window; cross-window sync
- **Daily Notes** — built-in schedule/日程 with calendar picker and auto-template
- **Full-Text Search** — ⌘K to search across the entire vault
- **Outline Drawer** — document structure sidebar with jump-to-line
- **Draft Recovery** — crash-safe unsaved content stored in `.margin/drafts/`
- **Theme** — Light / Dark / Auto (follows system)

---

## Requirements

- **Node.js** 20+ · **pnpm** 9+
- **Rust** toolchain 1.77+
- **macOS** (primary target)

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Development (hot reload for frontend + Rust)
pnpm dev

# Type check + tests
pnpm typecheck
pnpm test

# Production DMG build
pnpm build:adhoc
```

---

## Shortcuts

| Key | Action |
|-----|--------|
| ⌘S | Save |
| ⌘B | Toggle sidebar |
| ⌘\\ | Toggle outline |
| ⌘, | Settings |
| ⌘K | Search files |
| ⌘Shift+N | New window |

---

## Project Structure

```
margin/
├── src/
│   ├── renderer/src/        # React frontend (Vite)
│   │   ├── components/      # UI components
│   │   ├── editor/          # CodeMirror 6 + live preview
│   │   ├── hooks/           # React hooks
│   │   ├── lib/             # Utilities
│   │   └── stores/          # Zustand state stores
│   └── shared/              # Shared types (IPC)
├── src-tauri/               # Tauri backend (Rust)
│   └── src/
│       ├── commands.rs      # Tauri commands
│       ├── file_watcher.rs  # FS watcher
│       ├── fs_ops.rs        # File operations
│       └── vault_scanner.rs # Vault tree scanner
├── docs/                    # Documentation + change proposals
├── test/                    # Vitest test suites
└── release/                 # Release assets
```

---

## License

MIT
