## Why

Margin 目前是严格单窗口的 Markdown 编辑器，一个窗口只能编辑一个 vault 中的文件。当用户需要同时参考多个文档、跨 vault 操作、或在不同 vault 间切换时，单窗口模型严重限制效率。多窗口是桌面编辑器的基本能力 —— VS Code、Obsidian、Sublime Text 都支持。

## What Changes

- 支持通过快捷键（`Cmd+Shift+N`）和右键菜单创建新窗口
- 每个窗口是功能完全对等的独立副本：拥有完整的侧栏、标签页、编辑器、大纲、设置
- 不同窗口可以打开不同的 vault，各自独立管理
- 同一 vault 的文件变更通过跨窗口事件自动同步（冲突检测、文件树刷新）
- 跨窗口的状态协调：设置变更、主题切换即时同步到所有窗口
- 最后一个窗口关闭时退出应用
- 新窗口启动默认为空白状态（显示「打开文件夹开始编辑」），不自动恢复

## Capabilities

### New Capabilities

- `multi-window-lifecycle`: 窗口创建、快捷键（Cmd+Shift+N）、窗口关闭时保存检查、最后一个窗口退出应用
- `peer-window-state`: 每个窗口拥有独立的标签页集合、activePath、侧栏展开状态、大纲/双链面板状态；窗口间互不干扰
- `cross-window-sync`: 同一 vault 内文件变更的跨窗口同步（保存通知、冲突检测、路径变更通知）；设置和主题的跨窗口广播
- `multi-vault-watcher`: Rust 端支持同时监听多个 vault 的文件变更，每个 vault 独立管理其 watcher 生命周期

### Modified Capabilities

（无 —— 所有功能均为新增，不修改现有 spec）

## Impact

- **Rust 后端**: `WatcherManager` 从 `Mutex<Option<WatcherState>>` 改为 `Mutex<HashMap<String, WatcherState>>`，支持多 vault 同时监听
- **前端 stores**: 所有 Zustand store 不变（天然隔离），仅在写操作后新增事件广播
- **IPC**: 新增 4 个跨窗口事件协议（`settings-changed`, `theme-changed`, `file-saved`, `path-mutated`），无需新增 Rust command
- **UI 组件**: `RowContextMenu` 新增「在新窗口打开」菜单项；`DocumentTabs` 新增标签页右键菜单（可选）
- **不影响**: 编辑器核心（CodeMirror）、文件操作 command、草稿系统、更新系统均不受影响
