# Margin — Roadmap

> 最后更新：2026-06-23
> 当前版本：**v2.4** (Tauri v2 + React 18 + CodeMirror 6)

**Margin 是一款面向 Obsidian vault 的 Markdown 所见即所得（WYSIWYG）编辑器。**
原始 `.md` 文本始终是 source of truth；编辑器在源码之上做 live preview，光标进入即还原源码。

本 Roadmap 以「WYSIWYG 编辑器」为主线组织：先是编辑器内核架构（如何把编辑能力从 UI/运行时剥离），
然后是围绕编辑体验的产品迭代，最后是平台/生态的远期方向。实现现状见
[ARCHITECTURE.md](ARCHITECTURE.md)。

---

## P0 — 编辑器内核架构主线

> 目标：把 Margin 从「Tauri + React + CodeMirror 应用」演进为「可复用 Markdown WYSIWYG 编辑器
> 内核 + Obsidian-compatible vault + App Shell + 插件平台」。短期保留 Tauri/React/CM6，长期把核心
> 能力从具体 UI 和运行时剥离，为 Swift/TextKit、Web/WASM 等宿主预留路径。

### P0.1 editor-core — 平台无关编辑器内核　🟡 进行中

`src/renderer/src/editor-core/`。编辑器**语义**集中于此，禁止依赖具体渲染器
（`@codemirror/view`，由 boundary 测试守护）。

- [x] **建立 `editor-core` 边界** — 公共 barrel + 契约类型（`EditDoc` / `TextChange` /
      `EditResult`），projection 与 commands 两个半区分明。
- [x] **纯编辑命令层** — inline mark 切换、链接包裹、标题/引用/无序/有序/任务列表 toggle、
      上移/下移/复制行、任务复选框、列表延续/缩进、表格行列增删 + 对齐 + 建表，均为无 DOM
      可单测的纯函数（命令矩阵见 [EDITOR-FEATURES.md](EDITOR-FEATURES.md) §9）。
- [x] **CM adapter 桥接** — `editor/commands/{applyEdit,inlineMarkKeymap,blockKeymap}` 把
      `EditResult` 适配为 transaction；⌘B/⌘I/⌘E/⌘⇧X/⌘⇧H、⌘⌥1–6、⌘⇧7/8/9、⌘⇧.、⌥↑/↓、
      ⇧⌥↓ 接入（此前多数完全未绑定）。
- [ ] **projection 输入收敛** — `collectDecorations` 现以 CM `EditorState` 为入参（依赖 Lezer
      树，可接受）；进一步把输入抽象为 `{text, tree, selection}`，与 CM 解耦。
- [ ] **命令迁移收口** — 把仍散落在 widget/插件里的语义（slash 插入、图片粘贴、callout 折叠等）
      逐步落到 editor-core 命令层，view 层只做 IO 与渲染。
- [ ] **预留 `editor-textkit` 原型路径** — 用 Swift/TextKit 验证同一 projection schema 可渲染为
      attributed ranges / attachments（仅验证单文件编辑窗口）。

**验收标准**：现有 WYSIWYG 行为测试先冻结再抽 core；大文件增量解析不退化为全文重算；原始
Markdown 始终是 source of truth，projection 不改变存储格式。

### P0.2 vault-core / file-tree-core — Vault 与文件树内核　⬜

- [ ] **`vault-core`** — 文件扫描、隐藏目录、路径安全、assets、project config、drafts、watcher
      事件统一建模，输出稳定 `VaultSnapshot` / `VaultOperation` / `VaultEvent`。
- [ ] **`file-tree-core`** — 树归一化、排序、过滤、虚拟目录、rename/move/trash plan 独立于 UI；
      文件树 UI 只消费 view model。
- **验收**：大 vault 增量扫描 + 事件合并；rename/move/trash 与打开标签、草稿、跨窗口事件一致。

### P0.3 App Shell + command registry　⬜

- [ ] **明确 App Shell 职责** — window/menu/快捷键/settings/layout/panels/dialogs/updater/native，
      通过 service 调用核心能力，不实现 Markdown 语义。
- [ ] **command registry** — 同一命令注册表驱动菜单、快捷键、slash menu、命令面板与插件命令。
- [ ] **macOS 原生体验** — 菜单、Preferences、Open Recent、Services、Finder 集成、窗口恢复。

### P0.4 plugin platform — 插件优先架构　⬜

- [ ] **`plugin-api` / `plugin-host`** — 插件通过 facade 访问 `editor`/`vault`/`workspace`/
      `commands`/`ui`，不能直接碰 Zustand store、CM 实例、Tauri invoke 或底层 fs。
- [ ] **权限与贡献点** — 权限如 `editor.decorate`、`vault.write`、`network`；贡献点如 syntax
      extension、block renderer、slash item、command、sidebar panel、status item、file badge。
- [ ] **内置功能插件化** — Mermaid/KaTeX/outline/backlinks/calendar/templates/export 先按内置
      插件边界重构，内部稳定后再开放第三方。

### 推荐迁移顺序

1. 冻结现有编辑器行为测试（live preview、table、frontmatter、wiki link、list、rich content、
   math、diagram、image）。
2. 继续从 `editor/livePreview/*` 收口 editor-core 纯函数与 projection schema。**（进行中）**
3. 把业务语义彻底移出 CM `StateField`/`ViewPlugin`，adapter 只剩 IO/渲染。
4. 抽出 `vault-core` / `file-tree-core`。
5. 建 command registry，统一各处命令来源。
6. 建内部 `plugin-api`，迁移内置能力。
7. 做 Swift/TextKit 单文件编辑原型，评估 native shell + TextKit adapter 收益。

---

## 已完成版本

| 版本 | 主题 | 关键能力 |
|------|------|---------|
| **v0–v1 (M0–M1)** | 单文件编辑器 | CM6 Markdown 核心、打开/保存（IPC→Rust fs）、800ms 防抖自动保存、⌘S、语法高亮、Tauri 骨架 |
| **v2.0 (M2–M3)** | Live Preview · 排版 | 代码块/表格/frontmatter/行内格式/wiki 链接/任务复选框/脚注预览渲染；三主题；oklch token；IBM Plex 字体 |
| **v2.1 (M4–M5)** | 文件管理 · 窗口 | vault 扫描、文件树、右键菜单（新建/重命名/移动/回收站/复制路径/Finder）、隐藏目录、移动对话框、自定义标题栏、状态栏、日程 |
| **v2.2 (M6–M7)** | 更新 · 编辑体验 | Tauri updater、⌘K 全局搜索、Tab 列表缩进、Enter 列表延续、`/` 斜杠菜单、wiki 跳转、表格行操作 |
| **v2.3** | 多标签 · 多窗口 | 标签栏、per-tab draft/冲突、崩溃恢复草稿、路径变更保存协调、对等多窗口、跨窗口同步、多 vault |
| **v2.4** | 富内容扩展 | Mermaid/PlantUML/Graphviz 图表、KaTeX 公式、图片拖拽粘贴/尺寸/预览、video/audio 嵌入、Callout、`==高亮==` |

> 注：本仓库当前运行时为 **Tauri v2 + React + CodeMirror 6**。

---

## v2.5 — 编辑体验深化 · 知识关联　⬜

> 以编辑器为中心：先补齐 WYSIWYG 编辑的「手感」缺口，再增强笔记间关联。
> 预计：2026 Q4

### 2.5.1 编辑手感（核心）

- [ ] **inline 命令补全** — 在 editor-core inline mark 基础上补：清除格式、选区内换行保持列表、
      智能引号/破折号、成对符号自动闭合（`()` `[]` `**`）。
- [ ] **键盘可达的块操作** — 任务复选框 toggle、表格行/列增删、callout 折叠、移动行/块，均走
      command registry，可绑定快捷键与 slash 菜单。
- [ ] **slash 菜单内容化** — 命令来自 registry（标题、列表、表格、callout、公式、日期），支持
      模糊搜索与最近使用。

### 2.5.2 知识图谱与反链

- [ ] **局部/全局图谱** — 当前文档出入链可视化 → vault 级关联网络；力导向/径向布局，节点按引用数
      缩放、按文件夹分色；>5000 节点降精度渲染。
- [ ] **反向链接增强** — 带上下文段落摘录；未链接提及检测；出链/入链/孤岛统计。

### 2.5.3 元数据

- [ ] **标签系统** — `#tag` 与 frontmatter `tags:` 解析、标签面板、自动补全、嵌套标签。
- [ ] **frontmatter 类型化编辑** — 日期 picker、列表 tag input、布尔 toggle、`aliases` 搜索/
      wiki 匹配、属性模板。

---

## v2.6 — 品质 · 性能　⬜

> WYSIWYG 编辑器的下限决定体验：大文件不卡、解析不退化、回归有测试守护。
> 预计：2027 Q1

- [ ] **大文件编辑** — >10k 行：viewport 虚拟化调优、**live preview decoration 增量更新（避免全文
      重解析）**、可视区外延迟语法高亮。
- [ ] **大 vault 扫描** — >10k 文件：Rust 增量缓存（仅扫描变更子树）、文件树虚拟滚动、搜索索引预建。
- [ ] **测试与回归** — 覆盖率 >80%（CM 扩展、IPC、store、widget）；large-file / large-vault
      benchmark；E2E（Playwright/WebDriver）。
- [ ] **健壮性** — React Error Boundary 隔离编辑器/侧边栏/单个富内容块；内存泄漏检查（关闭标签
      彻底清理 CM view 与订阅）；本地崩溃日志 + 可选匿名遥测。
- [ ] **无障碍** — 键盘导航、ARIA（tree/tablist/textbox）、VoiceOver/NVDA、高对比度主题。

---

## v2.7 — 输出 · 复用 · 个性化　⬜

> 让编辑成果可输出、可复用、可个性化。预计：2027 Q2

- [ ] **导出** — PDF（排版、页眉页脚、高亮/表格/图表、字体嵌入）、HTML（内联 CSS + base64）、批量
      导出、复制为富文本（RTF/HTML clipboard）、导出预览。
- [ ] **模板** — 笔记/日程模板（`{{title}}`/`{{date}}`/`{{cursor}}` 变量）、片段（内置 + 用户
      `.margin/snippets/`，slash 插入）。
- [ ] **主题与排版** — `.margin/themes/*.css` 自定义主题、可视化调色、内置 Solarized/Nord/
      Catppuccin、自定义字体、行距/正文宽度/首行缩进。

---

## v2.8 — 插件架构　⬜

> 落地 P0.4：核心精简，社区可扩展。预计：2027 Q3

- [ ] **插件 API + 沙箱** — `MarginPlugin` 接口、`PluginContext`（editor/commands/sidebar/
      settings/vault/events）、声明式权限模型、API 版本化。
- [ ] **内置功能插件化** — outline / backlinks / calendar / mermaid / math / templates / export
      迁移为预装可禁用插件。
- [ ] **插件管理** — 设置内插件页（启用/禁用/版本/错误态）、本地安装、热重载、DevTools
      （插件状态、StateField 快照、事件流、CM transaction 火焰图）。

---

## 远期方向（非核心编辑器）　⬜

> 平台与生态扩展，待编辑器内核与 vault-core 边界稳定后推进。预计：2027 Q4+

- **跨平台** — Windows / Linux 正式支持（路径差异、原生菜单、文件监听、打包、Wayland）。
- **版本历史** — Git 集成（自动 commit、文件历史、可视化 diff、回退）或内置本地快照
      （`.margin/history/`）。
- **同步** — 可选 E2EE 云同步（增量传输、冲突合并）、设置同步。
- **移动端** — iOS 伴侣 App（SwiftUI，简化版编辑器、Quick Capture、分享扩展）；Android 视反馈决定。
- **发布与剪藏** — vault → 静态站点（保留 wiki 链接/图谱，一键部署）；浏览器 Web Clipper。

---

## 技术债务 & 持续改进

贯穿所有版本（每版约 20% 时间）：

- **测试覆盖率** → >80%（当前 67 个测试文件，覆盖不完整）。
- **性能回归** — large vault / large file benchmark 纳入 CI。
- **错误追踪** — 本地崩溃日志 + 可选匿名报告。
- **文档** — 用户手册、功能说明、开发者贡献指南（含 editor-core 命令编写指南）。
- **CI/CD** — GitHub Actions 多平台构建 + 测试 + 发布。
- **i18n** — 统一中英文翻译框架（当前混杂）。
- **依赖升级** — Tauri / React / CodeMirror 定期升级。

---

## 版本路线总览

```
v2.4 (已完成)  富内容扩展
    ↓
P0 主线（贯穿）  editor-core ▸ vault-core/file-tree-core ▸ command registry ▸ plugin-api
    ↓
v2.5 (2026 Q4)  编辑手感 · 知识图谱 · 标签/frontmatter
    ↓
v2.6 (2027 Q1)  大文件/大 vault 性能 · 测试回归 · 无障碍
    ↓
v2.7 (2027 Q2)  导出 · 模板 · 主题
    ↓
v2.8 (2027 Q3)  插件架构（落地 P0.4）
    ↓
远期 (2027 Q4+)  跨平台 · 版本历史 · 同步 · 移动端 · 发布
```
