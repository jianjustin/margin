# Margin

A WYSIWYG Markdown editor for Obsidian vaults — Bear-like typography, Obsidian-compatible data model.
Built on Tauri v2 + React + TypeScript (Vite), Tailwind CSS, Zustand, and CodeMirror 6.

Obsidian vault 的所见即所得 Markdown 编辑器 —— Bear 风格的排版，兼容 Obsidian 数据模型。
基于 Tauri v2 + React + TypeScript（Vite）、Tailwind CSS、Zustand 和 CodeMirror 6 构建。

---

## Features / 功能

- **WYSIWYG Markdown**: Live preview with rich block rendering (tables, code blocks, frontmatter)
- **Obsidian-compatible**: Works directly on Obsidian vaults; supports wiki links (`[[link]]`), backlinks, and YAML frontmatter
- **File Tree Sidebar**: Browse, create, rename, move, and trash notes and folders
- **Document Tabs**: Open multiple documents in a single window
- **Multi-Window** (v2.3.0): Create fully-functional peer windows; different windows can open different vaults; settings and theme sync across windows
- **Schedule / 日程**: Built-in daily notes with calendar picker
- **Search**: Full-text search across the vault (⌘K)
- **Outline Drawer**: Document structure sidebar
- **Draft Recovery**: Crash-safe unsaved content recovery
- **Theme**: Light / Dark / Auto mode

---

## Requirements / 环境要求

- **Node.js** 20+ and **pnpm** 9+
- **Rust** toolchain (1.77+)
- macOS (primary target; other platforms may work but are untested)

## Getting Started / 快速开始

```bash
# 1. Install dependencies
pnpm install

# 2. Launch in development mode (hot reload for frontend + Rust)
pnpm dev

# 3. Run type checks and tests
pnpm typecheck
pnpm test
```

```bash
# Build production DMG
pnpm build:adhoc
```

## Shortcuts / 快捷键

| Key / 快捷键 | Action / 操作 |
|-------------|--------------|
| ⌘S | Save / 保存 |
| ⌘B | Toggle sidebar / 切换侧栏 |
| ⌘\\ | Toggle outline / 切换大纲 |
| ⌘, | Settings / 设置 |
| ⌘K | Search files / 搜索文件 |
| ⌘Shift+N | New window / 新建窗口 |

## Project Structure / 项目结构

```
margin/
├── src/
│   ├── renderer/src/        # React frontend (Vite)
│   │   ├── components/      # UI components
│   │   ├── editor/          # CodeMirror 6 setup + live preview
│   │   ├── hooks/           # React hooks
│   │   ├── lib/             # Utilities
│   │   └── stores/          # Zustand state stores
│   └── shared/              # Shared types (IPC)
├── src-tauri/               # Tauri backend (Rust)
│   └── src/
│       ├── commands.rs      # Tauri invoke commands
│       ├── file_watcher.rs  # FS watcher
│       ├── fs_ops.rs        # File operations
│       └── vault_scanner.rs # Vault tree scanner
├── docs/                    # Documentation + change proposals
├── test/                    # Vitest test suites
└── release/                 # Release assets
```

## License / 许可证

MIT
