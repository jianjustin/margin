---
title: Margin M4 — 文件树侧栏（打开文件夹 + 浏览 + CRUD + 外部变动重载）
tags: [项目, 笔记软件, spec, m4, file-tree]
created: 2026-05-31
parent: 2026-05-31-margin-wysiwyg-editor-design.md
status: approved
---

# Margin M4 — 设计 Spec

## 0. 背景与范围

M0–M3 已交付：Electron + React + CM6 的 Typora 式编辑器，单文件读写、live-preview、
Bear 主题 + 跟随系统。目前只能通过「Open…」对话框一次开一个文件，没有目录浏览。

M4 加上**文件树侧栏**：打开一个文件夹（vault）→ 递归扫描 → 树形浏览 → 点击切换 `.md`，
并监听外部改动实时重载、支持基本文件 CRUD。

本次新增的文件系统能力全部在 **main 进程**，renderer 仍不碰 `fs`（沿用 M0 铁律）。

## 1. 不可妥协约束（继承）

- markdown 文本是唯一真相，往返逐字无损。
- 本地优先：不联网、不进 vault 写应用字段；偏好（vault 根路径）存 localStorage。
- **不修改** `.obsidian/`、`.trash/`、`.git/` 等隐藏目录；文件树**默认隐藏** dotfiles/
  隐藏目录（区别于旧 Swift spec 的「显示隐藏目录」——本应用聚焦编辑，隐藏目录是噪音）。
- 删除 = 移到系统废纸篓（`shell.trashItem`），**绝不 `unlink` 硬删**。

## 2. 架构与 IPC 契约

### 2.1 进程分工

Main 进程新增（`src/main/` 下）：
- `vaultScanner.ts` — 递归扫描目录 → `TreeNode[]`（一次性全扫）。
- `fileWatcher.ts` — `fs.watch(root, { recursive: true })` 封装，debounce 300ms。
- `fsOps.ts` — CRUD：create note / create folder / rename / trash。

Renderer 经 preload 的 `window.margin` 调用，**绝不直接 fs**。

### 2.2 TreeNode 类型（放 `src/shared/ipc.ts`）

```ts
export interface TreeNode {
  name: string                 // basename
  path: string                 // 绝对路径
  type: 'file' | 'folder'
  children?: TreeNode[]        // 仅 folder 有；文件无
}
```

### 2.3 IPC 扩展（追加到 `MarginApi`）

| 方向 | 通道常量 | 签名 | 说明 |
|---|---|---|---|
| R→M | `dialog:openFolder` | `() → string \| null` | 选目录对话框 |
| R→M | `vault:scan` | `(root: string) → TreeNode[]` | 递归扫描 |
| R→M | `file:create` | `(dir, name) → string` | 新建 `.md`，返回新路径 |
| R→M | `folder:create` | `(dir, name) → string` | 新建文件夹，返回新路径 |
| R→M | `path:rename` | `(oldPath, newName) → string` | 重命名，返回新路径 |
| R→M | `path:trash` | `(path) → void` | 移到系统废纸篓 |
| M→R | `vault:changed` | `(root: string)` | watcher 推送，renderer 重扫 |

`vault:changed` 用 `webContents.send`；renderer 在 preload 暴露 `onVaultChanged(cb)`
订阅（返回取消函数）。

### 2.4 扫描规则（vaultScanner）

- 递归遍历；跳过名字以 `.` 开头的文件/目录（dotfiles/隐藏目录）。
- 收录：文件夹（含空文件夹）+ 扩展名 `.md` / `.markdown` 的文件。其余文件类型 M4 不显示
  （v2 可加 `.canvas`/`.json`，交互稿图标已留位）。
- 排序：每层先文件夹后文件，各自按名称 `localeCompare`（中文友好）升序。
- 出错（权限等）：跳过该项，不中断整棵树。

## 3. Renderer 状态与组件

### 3.1 vaultStore（`src/renderer/src/stores/vaultStore.ts`，Zustand）

- `root: string | null` — 当前 vault 根，初始化自 localStorage `margin.vaultRoot`。
- `tree: TreeNode[]`
- `expanded: Set<string>` — 展开的文件夹路径集
- `selectedPath: string | null` — 当前选中文件
- actions：`openRoot(root, tree)`（设根 + 树 + 持久化）、`setTree(tree)`（仅换结构，
  保留 expanded/selected）、`toggleExpanded(path)`、`select(path)`、`closeVault()`。

### 3.2 flattenTree 纯函数（`src/renderer/src/lib/flattenTree.ts`）

`flattenTree(tree, expanded): FlatRow[]`，`FlatRow = { node, depth }`。
只产出可见行（折叠的文件夹不展开其子项）。纯函数，便于 TDD + 渲染。

### 3.3 组件（`src/renderer/src/components/FileTree/`）

- `Sidebar.tsx` — 容器：头部（品牌 + 打开文件夹按钮）+ 滚动区 + 空态（「打开一个文件夹」）。
- `FileTree.tsx` — 调 `flattenTree` 渲染行列表。
- `FileTreeRow.tsx` — 单行（接交互稿 `.tree-row`）：chevron（folder，旋转表展开）、
  图标（`.md`→暖金「MD」/folder→暖金 folder 图标）、名称（folder weight 600）、
  选中态（`accent-soft` 底 + `accent-line` 边）、hover（`bg-hover`）。
- `RowContextMenu.tsx` — 右键菜单（见 §5）。
- `InlineRename.tsx` 或复用：重命名/新建的 inline 输入框。

### 3.4 布局（App.tsx）

改为左右两栏：侧栏（244px，可折叠）+ 编辑区。标题栏加「侧栏切换」按钮（接交互稿）。
打开文件夹后默认显示侧栏；未打开时侧栏显空态。单文件「Open…」按钮保留（仍可单开文件）。

## 4. 外部变动重载

### 4.1 树结构变动

`vault:changed` 推送 → renderer 调 `vault:scan` 重扫 → `setTree`（保留 expanded/selected）。
debounce 在 main 侧（300ms）已做，renderer 直接重扫。

### 4.2 当前打开文件被外部修改

- 复用 documentStore 的 `isDirty()`。
- **未脏**：静默重载（重新 `file:read` → `load`）。
- **已脏**：弹确认「文件已被外部修改 — 保留我的版本 / 加载磁盘版本」。
  - 保留：什么都不做（下次保存覆盖磁盘）。
  - 加载：`file:read` → `load`（丢弃本地改动）。

> 判断「当前文件是否被改」：watcher 粒度是「vault 变了」，renderer 重扫后比对当前
> `selectedPath` 是否仍存在 + 重新读内容与 `savedContent` 是否不同来决定。简化实现：
> 收到 `vault:changed` 时，若有打开文件，按上面规则处理。

### 4.3 当前文件被外部删除

重扫后 `selectedPath` 不在树中 → 提示「当前文件已被删除」→ 清空编辑区（documentStore 重置）。

## 5. CRUD 交互

- 右键文件夹：新建笔记 / 新建文件夹 / 重命名 / 删除。
- 右键文件：重命名 / 删除。
- **新建笔记**：在目标文件夹 inline 输入名字 → `file:create(dir, name)`（自动补 `.md`，
  重名则 `name-1.md`）→ 选中并打开新文件。
- **新建文件夹**：`folder:create`。
- **重命名**：inline 输入 → `path:rename`（同目录改名）。若改的是当前打开文件，更新
  documentStore 的 path。
- **删除**：确认 → `path:trash`（系统废纸篓）。若删的是当前打开文件，清空编辑区。
- 所有 CRUD 成功后：本地乐观更新树 + watcher 兜底重扫保证最终一致。

> 名称冲突 / 非法字符：main 侧做基本校验（空名拒绝、重名追加 `-N`、保留路径分隔符校验），
> 失败抛错 → renderer toast/提示。

## 6. 文件结构

```
src/main/
├─ index.ts             改：注册新 handlers + 启动 watcher 生命周期
├─ vaultScanner.ts      新增：scan(root) → TreeNode[]
├─ fileWatcher.ts       新增：watch(root, onchange) debounce 300ms
└─ fsOps.ts             新增：createNote/createFolder/rename/trash
src/shared/ipc.ts       改：IPC 通道常量 + TreeNode + MarginApi 扩展
src/preload/index.ts    改：暴露新方法 + onVaultChanged 订阅
src/renderer/src/
├─ stores/vaultStore.ts 新增
├─ lib/flattenTree.ts   新增（纯函数）
├─ components/FileTree/
│  ├─ Sidebar.tsx
│  ├─ FileTree.tsx
│  ├─ FileTreeRow.tsx
│  ├─ RowContextMenu.tsx
│  └─ InlineRename.tsx
├─ hooks/useVaultWatch.ts 新增：订阅 onVaultChanged → 重扫 + 脏态处理
└─ App.tsx              改：两栏布局 + 侧栏切换 + 打开文件夹接线
test/
├─ flattenTree.test.ts
├─ vaultStore.test.ts
└─ vaultScanner.test.ts  （在临时目录建真实文件结构测扫描/忽略/排序）
```

## 7. 测试策略

- **纯逻辑 TDD（node）**：
  - `flattenTree`：折叠隐藏子项、深度正确、文件夹优先排序。
  - `vaultStore`：openRoot 持久化、setTree 保留 expanded/selected、toggle/select。
  - `vaultScanner`：在 `os.tmpdir()` 建真实目录树（含 dotfile、嵌套、非 md 文件），
    断言忽略规则 + 排序 + 树形（main 侧纯函数，node 可直接测 fs）。
- **DOM 冒烟（jsdom）**：Sidebar 渲染一棵树、点击行 select、空态文案。
- **手动 GUI 验收**：打开真实 vault、展开/折叠、切换文件、外部改/删文件实时反映、
  CRUD（新建/重命名/删除到废纸篓）。
- 全程 `npm run typecheck` + `npm run build` 必过。

## 8. 分阶段路线（实现计划细化）

| 阶段 | 交付 |
|---|---|
| M4a | IPC：openFolder + vault:scan + vaultScanner（TDD）+ preload + 类型 |
| M4b | vaultStore + flattenTree（TDD）+ Sidebar/FileTree/Row + 两栏布局 + 点击切换 + 启动重开 |
| M4c | fileWatcher + vault:changed + useVaultWatch + 外部变动重载（脏态处理） |
| M4d | CRUD（fsOps + 右键菜单 + inline 输入 + trash） |

每段独立提交 + 验收。

## 9. 显式非目标（M4 不做）

- 拖拽移动 / 多选 / 跨文件夹移动。
- 搜索框（全文搜索是后续里程碑；交互稿的搜索框 M4 只占位或不放）。
- tag 视图、反向链接、笔记列表中栏（旧三栏的中栏不做）。
- 显示 dotfiles/隐藏目录（默认隐藏；若以后要看再加开关）。
- `.canvas`/`.json` 等非 md 文件显示（留 v2）。
- 笔记摘要 / mtime 预览行。

## 10. 关键决策记录

- 扫描：一次性递归全扫（个人 vault 规模，零展开延迟）。
- 范围：M4 含 CRUD（新建/重命名/删除）。
- 启动：记住并自动重开上次 vault（localStorage）。
- 删除：`shell.trashItem` 系统废纸篓，非硬删。
- 隐藏目录：默认隐藏（与旧 Swift spec 相反，聚焦编辑体验）。
- renderer 不碰 fs，全部经 main + 类型化 IPC。
