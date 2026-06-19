## 1. Rust 后端 — 多 Vault 文件监听

- [x] 1.1 `WatcherManager` 改为 `HashMap<String, WatcherState>`（`src-tauri/src/commands.rs`）
- [x] 1.2 `scan_vault` 中改为仅在 watcher 不存在时创建（`HashMap::entry` + `or_insert_with`）
- [ ] 1.3 验证：手动启动两个窗口分别打开不同 vault，确认两个 vault 的 watcher 均正常工作

## 2. 窗口基础设施

- [x] 2.1 新建 `src/renderer/src/lib/windowManager.ts`：封装 `WebviewWindow` 创建逻辑（label 生成、URL 拼接、默认尺寸）
- [x] 2.2 新建 `src/renderer/src/lib/eventBridge.ts`：统一管理跨窗口事件 emit/listen（settings-changed、theme-changed、file-saved、path-mutated）
- [x] 2.3 `App.tsx` 添加 `Cmd+Shift+N` 快捷键处理器，调用 `windowManager.createPeerWindow()`

## 3. 新窗口启动流程

- [x] 3.1 `App.tsx` 启动时检查 URL query params（`?open=<path>&vault=<root>`），有参数则自动扫描 vault 并打开文件
- [x] 3.2 新窗口（无 URL 参数）启动时不自动恢复 vault，保持空白状态
- [x] 3.3 主窗口启动行为保持不变（从 localStorage 恢复上次 vault）

## 4. 跨窗口状态同步

- [x] 4.1 `settingsStore` 中 `setScheduleEnabled`、`setScheduleDir`、`setHiddenFolders` 等写操作后 emit `settings-changed`
- [x] 4.2 `themeStore` 中 `setMode` 后 emit `theme-changed`
- [x] 4.3 `eventBridge.ts` 中注册 `settings-changed` 和 `theme-changed` 的 listener，收到后更新对应 store（带防重入保护：忽略来自自己窗口的事件）
- [x] 4.4 `saveDocument.ts` 中写文件成功后 emit `file-saved`（{ path, content }）
- [x] 4.5 `eventBridge.ts` 中注册 `file-saved` listener，收到后更新对应 tab 的 `savedContent`（如果 tab 存在且 content 匹配）

## 5. 路径变更跨窗口协调

- [x] 5.1 `App.tsx` 中 `doRename`、`doMove`、`doTrash` 成功后 emit `path-mutated`（{ action, oldPath, newPath? }）
- [x] 5.2 `eventBridge.ts` 中注册 `path-mutated` listener：收到后直接 `replacePath`（rename/move）或 `removePath`（trash），绕过 watcher 延迟
- [x] 5.3 `useVaultWatch.ts` 中增加 vault root 过滤：仅当 `event.payload` 匹配当前窗口的 `vaultStore.root` 时才处理
- [x] 5.4 `useVaultWatch.ts` 中避免 `path-mutated` 已处理的路径被 `vault-changed` 误报为"文件已删除"

## 6. 窗口关闭与退出

- [x] 6.1 `App.tsx` 注册 `window.onbeforeunload` 或 Tauri `close_requested` 事件，关闭前遍历 dirty tabs 逐一保存
- [x] 6.2 关闭时若有 conflict 或 save error，阻止关闭并将问题 tab 置为 active
- [x] 6.3 最后一个窗口关闭时退出应用（`app.exit()` 或默认行为确认）

## 7. UI 入口

- [x] 7.1 `RowContextMenu.tsx` 对 Markdown 文件节点新增「在新窗口打开」菜单项（使用 `ScanEye` 或 `ExternalLink` 图标）
- [x] 7.2 「在新窗口打开」调用 `windowManager.createPeerWindow()` 并传入 `?open=<path>&vault=<root>` URL 参数

## 8. 端到端验证

- [ ] 8.1 单 vault 双窗口：两个窗口打开同一 vault 的不同文件，验证设置同步、文件保存同步、冲突检测
- [ ] 8.2 多 vault 双窗口：两个窗口打开不同 vault，验证互不干扰、watcher 独立工作
- [ ] 8.3 重命名/删除协调：窗口A重命名文件，验证窗口B tab 路径自动更新且不弹误报警告
- [ ] 8.4 窗口关闭流程：验证 dirty tab 自动保存、conflict 阻止关闭、最后窗口退出应用
- [ ] 8.5 新窗口空白启动：验证 `Cmd+Shift+N` 创建空白窗口，右键「在新窗口打开」创建带文件的窗口
