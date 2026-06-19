## Context

Margin 是 Tauri v2 桌面应用（React + TypeScript 前端, Rust 后端），Markdown WYSIWYG 编辑器，面向 Obsidian vault。当前架构：

- **单窗口**：`tauri.conf.json` 定义唯一 `WebviewWindow`
- **状态管理**：Zustand stores（`documentStore`, `vaultStore`, `settingsStore`, `themeStore`），纯内存、per-webview
- **文件监听**：Rust 端 `WatcherManager` 持有单一 `WatcherState`，FS 变更通过 `emit("vault-changed", root)` 广播到前端
- **IPC**：Tauri `invoke` commands（文件读写、vault 扫描、草稿管理），事件 `emit`/`listen`
- **localStorage**：`vaultRoot`, `settings`, `themeMode`, 面板宽度持久化

核心约束：每个 Tauri webview 是独立的 JS 运行时，Zustand store 天然隔离；Tauri `emit()` 默认广播到所有窗口（`{ kind: 'Any' }`）。

## Goals / Non-Goals

**Goals:**
- 支持用户同时打开多个对等窗口，每个窗口拥有完整功能（侧栏、编辑器、标签页、设置）
- 不同窗口可打开不同 vault，互不干扰
- 同一 vault 的文件变更在所有窗口间实时同步
- 最小化 Rust 端改动，尽可能复用前端现有机制
- 新窗口默认空白，最后由用户决定打开哪个 vault

**Non-Goals:**
- 窗口位置/大小记忆与会话恢复
- 可拖拽标签页（detach/attach tabs）
- 窗口内分割面板（split panes）
- 跨窗口标签页迁移（「移动到新窗口」）
- 多显示器特殊处理

## Decisions

### Decision 1: 完全对等窗口模型

**选择**：每个窗口加载相同的 `index.html`，运行完整的 React app 实例。

**理由**：
- 零额外复杂度 —— Zustand store 天然隔离，无需区分「主窗口」和「辅助窗口」
- 用户可在任何窗口执行任何操作（打开 vault、编辑设置、浏览文件树）
- 与 VS Code / Obsidian 的窗口模型一致

**备选方案**：主窗口 + 辅助编辑器窗口（辅助窗口纯编辑器，无侧栏）。被拒绝：用户明确要完全对等功能。

### Decision 2: 窗口创建方式（JS 端）

**选择**：使用 `@tauri-apps/api/window` 的 `WebviewWindow` 从 JS 端创建窗口。

**理由**：
- 无需新增 Rust command
- 创建接口简单统一
- 窗口 label 自动生成（`win-{timestamp}`），避免冲突

**备选方案**：Rust `create_editor_window` command。被拒绝：增加不必要的 IPC 往返，JS 端 API 已足够。

### Decision 3: 新窗口启动行为

**选择**：新窗口不自动恢复 vault，显示空白状态。

**理由**：用户明确要求。避免在不同的 vault 窗口间产生混淆。主窗口仍可从 localStorage 恢复上次的 vault（保持不变）。

### Decision 4: 多 Vault 文件监听

**选择**：`WatcherManager` 从 `Mutex<Option<WatcherState>>` 改为 `Mutex<HashMap<String, WatcherState>>`。每个 vault root 独立管理 watcher 生命周期。watcher 在 vault 首次被扫描时创建，窗口关闭时**不主动清理**（资源占用小，避免引用计数复杂度）。

**理由**：
- 最小改动（~10 行 Rust）
- 每个 vault 的 watcher 完全独立，互不干扰
- 延迟清理避免追踪「多少窗口在使用某 vault」的复杂性

**备选方案**：每个窗口维护自己的 watcher。被拒绝：如果多个窗口打开同一 vault，会有重复 watcher 和重复事件。

### Decision 5: 跨窗口状态同步

**选择**：Tauri events 作为跨窗口通信的唯一通道。状态变更时 emit 事件，其他窗口 listen 并更新内存 store。不使用 localStorage 的 `storage` 事件（asset protocol 下不可靠）。

**事件协议**：

| 事件 | 方向 | Payload | 触发时机 |
|------|------|---------|----------|
| `vault-changed` (已有) | Rust → 所有窗口 | `string` (root) | FS 变更 |
| `settings-changed` | JS → 所有窗口 | `Partial<Settings>` | 用户修改设置 |
| `theme-changed` | JS → 所有窗口 | `ThemeMode` | 用户切换主题 |
| `file-saved` | JS → 所有窗口 | `{ path, content }` | 保存成功后 |
| `path-mutated` | JS → 所有窗口 | `{ action, oldPath, newPath? }` | 重命名/移动/删除后 |

所有 JS emit 使用默认 target（`{ kind: 'Any' }`），自动广播到所有窗口（包括自己）。接收端通过 root 过滤无关事件。

### Decision 6: 保存竞态处理

**选择**：利用现有 `saveDocument` 的「写前检查」逻辑 + 新增 `file-saved` 事件缩小竞态窗口。

现有保护（`saveDocument.ts:44-55`）：写文件前读取磁盘内容，若 `disk !== tab.savedContent && disk !== tab.content` → 触发冲突。

增量加固：保存成功后立即 emit `file-saved`。其他窗口收到后更新对应 tab 的 `savedContent`，使得下次保存前的磁盘检查能正确检测到外部变更。

**备选方案**：文件锁（`.lock` 文件）。被拒绝：过于重量级，不适合 Markdown 编辑器。

### Decision 7: 应用退出策略

**选择**：最后一个窗口关闭时退出应用。

**理由**：用户明确选择跨平台一致行为。不使用 macOS 的 `lastWindowHides` 惯例。

### Decision 8: vault-changed 事件过滤

**选择**：前端 `useVaultWatch` 在收到 `vault-changed` 时比较 `event.payload`（root）与当前窗口的 `vaultStore.root`。仅当匹配时才重新扫描 tree 和检查冲突。

**理由**：避免窗口A（vault X）的 FS 变更触发窗口B（vault Y）的无意义 tree 扫描。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 两窗口同时写同一文件的竞态 | file-saved 事件 + 写前磁盘检查；窗口期 < 100ms |
| vault-changed 事件风暴（多窗口同时扫描） | 已有 300ms debounce；实际窗口数 ≤5 |
| Watcher 泄漏（窗口关闭不清理） | 单个 watcher 资源占用极小；后续可加引用计数优化 |
| asset protocol 下 localStorage 不可靠同步 | 所有跨窗口同步走 Tauri events，localStorage 仅持久化 |
| path-mutated 事件丢失导致误报「文件被删除」 | useVaultWatch 仍然有 vault-changed 作为回退，只是延迟更高 |
