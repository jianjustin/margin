# Margin

> 所见即所得的 Markdown 编辑器，专为 Obsidian vault 设计 —— Bear 风格的排版，兼容 Obsidian 数据模型。

基于 **Tauri v2** + **React** + **TypeScript**（Vite）、Tailwind CSS、Zustand 和 CodeMirror 6 构建。

[English](README.md)

---

## 关于

**Margin** 是一款原生 macOS Markdown 编辑器，为使用 [Obsidian](https://obsidian.md) vault 管理笔记的用户设计。与基于 Electron 的替代品不同，Margin 基于 Tauri v2 构建，提供轻量、原生的使用体验。

### 为什么选择 Margin？

- **直接编辑 Obsidian vault** —— 无需导入导出、无需格式转换。你的 `.md` 文件保持在原位。
- **所见即所得实时预览** —— 编辑底层 Markdown 的同时以富文本形式呈现。表格、代码块和 YAML frontmatter 以内联样式块渲染。
- **Bear 风格排版** —— 使用 IBM Plex 字体系列，简洁可读。
- **原生性能** —— Tauri v2 Rust 后端 + React 前端。比 Electron 应用更小的体积、更低的内存占用。
- **多窗口、多 Vault**（v2.3.0）—— 在不同窗口中打开不同 vault，跨窗口同步设置和主题。

---

## 功能

- **所见即所得 Markdown** —— 实时预览，表格、代码块、frontmatter 以富文本块渲染
- **Obsidian 兼容** —— wiki 链接（`[[link]]`）、双链面板、YAML frontmatter、`.obsidian` 安全
- **文件树侧栏** —— 浏览、创建、重命名、移动、删除笔记和文件夹
- **文档标签页** —— 多文档同时打开；⌘S 保存，停止输入 800ms 后自动保存
- **多窗口** —— 功能完全对等的窗口；每个窗口可打开不同 vault；跨窗口同步
- **日程** —— 内置每日笔记，支持日历选择器和自动模板
- **全文搜索** —— ⌘K 在整个 vault 中搜索
- **大纲抽屉** —— 文档结构侧栏，支持跳转到指定行
- **草稿恢复** —— 崩溃安全的未保存内容存储在 `.margin/drafts/` 中
- **主题** —— 浅色 / 深色 / 自动（跟随系统）

---

## 环境要求

- **Node.js** 20+ · **pnpm** 9+
- **Rust** 工具链 1.77+
- **macOS**（主要目标平台）

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（前端 + Rust 热更新）
pnpm dev

# 类型检查 + 测试
pnpm typecheck
pnpm test

# 构建生产 DMG
pnpm build:adhoc
```

---

## 快捷键

| 快捷键 | 操作 |
|--------|------|
| ⌘S | 保存 |
| ⌘B | 切换侧栏 |
| ⌘\\ | 切换大纲 |
| ⌘, | 设置 |
| ⌘K | 搜索文件 |
| ⌘Shift+N | 新建窗口 |

---

## 项目结构

```
margin/
├── src/
│   ├── renderer/src/        # React 前端 (Vite)
│   │   ├── components/      # UI 组件
│   │   ├── editor/          # CodeMirror 6 + 实时预览
│   │   ├── hooks/           # React hooks
│   │   ├── lib/             # 工具函数
│   │   └── stores/          # Zustand 状态管理
│   └── shared/              # 共享类型 (IPC)
├── src-tauri/               # Tauri 后端 (Rust)
│   └── src/
│       ├── commands.rs      # Tauri 命令
│       ├── file_watcher.rs  # 文件监听
│       ├── fs_ops.rs        # 文件操作
│       └── vault_scanner.rs # Vault 树扫描
├── docs/                    # 文档 + 变更方案
├── test/                    # Vitest 测试
└── release/                 # 发布资产
```

---

## 许可证

MIT
