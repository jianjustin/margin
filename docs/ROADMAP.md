# Margin — Roadmap

> 最后更新：2026-06-19
> 当前版本：**v2.4.0** (Tauri v2 + React 18 + CodeMirror 6)

Margin 是一款面向 Obsidian vault 的 WYSIWYG Markdown 编辑器。本 Roadmap 以「Markdown 笔记应用」的产品视角规划版本迭代，每个版本包含明确的功能清单、验收标准和技术要点。

---

## P0 高优先级 — 长期项目架构主线

> 目标：将 Margin 从「Tauri + React + CodeMirror 应用」逐步演进为「可复用 Markdown WYSIWYG 编辑器内核 + Obsidian-compatible vault 项目 + native-feeling App Shell + 插件平台」。短期继续保留 Tauri/React/CodeMirror，长期把核心能力从具体 UI 和运行时中剥离出来，为 Swift/AppKit、iOS、Web/WASM 或其他宿主预留路径。

### P0.1 Editor Project — 平台无关编辑器内核

- [ ] **建立 `editor-core` 边界** — 从 CodeMirror 插件中抽出纯编辑器逻辑：
  - Markdown/GFM/Obsidian 语义解析（frontmatter、wiki link、task、table、footnote、math、code fence、image、callout）
  - 编辑命令（toggle bold、continue list、toggle checkbox、insert table row、paste image、slash insert）
  - projection schema（style、conceal、block widget、link、diagnostic），作为 CodeMirror/TextKit 等渲染器的统一输入
- [ ] **保留 `editor-codemirror` 作为首个 adapter**
  - CodeMirror 仅负责输入、选区、decorations/widgets 渲染和 viewport 协调
  - 不再让业务语义直接散落在 CM6 `StateField`、`ViewPlugin` 和 React 组件中
- [ ] **预留 `editor-textkit` 原型路径**
  - 未来用 Swift/AppKit/TextKit 验证同一 projection schema 是否可渲染为 attributed ranges、attachments、layout fragments
  - 原型只验证单文件编辑窗口，不作为整 App 迁移前提
- [ ] **编辑器验收标准**
  - 现有 WYSIWYG 行为测试先冻结，再抽 core
  - 大文件增量解析不能退化为每次输入全文重算
  - 原始 Markdown 文本始终是 source of truth，projection 不改变存储格式

### P0.2 Vault / File Tree Project — Vault 模型与文件树核心

- [ ] **建立 `vault-core` 边界**
  - 文件扫描、隐藏目录、路径安全策略、assets 目录、project config、drafts、文件 watcher 事件统一建模
  - 输出稳定 `VaultSnapshot`、`VaultOperation`、`VaultEvent`，供 React/Swift/iOS UI 复用
- [ ] **建立 `file-tree-core` 边界**
  - 树归一化、排序、过滤、虚拟目录、rename/move/trash plan 独立于 UI
  - 文件树 UI 只消费 view model，不直接耦合 Rust command、Zustand store 或 DOM 行为
- [ ] **Vault 验收标准**
  - 大 vault 下支持增量扫描和事件合并
  - rename/move/trash 与打开标签、草稿、跨窗口事件保持一致
  - 插件未来可以贡献 file badge、context menu、virtual folder，但不能直接绕过路径策略

### P0.3 App Project — 宿主、窗口与原生能力

- [ ] **明确 App Shell 职责**
  - window lifecycle、menu、keyboard shortcuts、settings、layout、panels、dialogs、updater、native integrations
  - App Shell 通过 workspace/editor/vault/plugin service 调用核心能力，不直接实现 Markdown 语义
- [ ] **保留 `apps/margin-tauri` 为生产宿主**
  - 继续承载当前 React/Tauri 产品
  - 优先补齐 macOS 原生体验：菜单、Preferences、Open Recent、Services、Finder 集成、窗口恢复
- [ ] **规划 `apps/margin-macos` 原型**
  - Swift/AppKit 或 SwiftUI + AppKit，仅用于验证 native shell 和 TextKit/WebView editor adapter
  - 不在 editor-core 和 vault-core 边界稳定前全量迁移
- [ ] **App 验收标准**
  - 同一 command registry 能驱动菜单、快捷键、slash menu、命令面板和插件命令
  - UI 层不直接依赖具体编辑器实现细节

### P0.4 Plugin Platform — 插件优先架构

- [ ] **建立 `plugin-api` 和 `plugin-host`**
  - 插件通过 facade 访问 `editor`、`vault`、`workspace`、`commands`、`ui`
  - 插件不能直接访问 Zustand store、CodeMirror instance、Tauri invoke 或底层文件系统
- [ ] **定义权限与贡献点**
  - 权限示例：`editor.read`、`editor.decorate`、`vault.read`、`vault.write`、`network`
  - 贡献点示例：editor syntax extension、block renderer、slash menu item、command、sidebar panel、status bar item、file badge、context menu、export action
- [ ] **内置功能插件化**
  - Mermaid、KaTeX、outline、backlinks、calendar、templates、export 优先按内置插件边界重构
  - 先内部使用插件 API，稳定后再开放第三方插件
- [ ] **插件验收标准**
  - 插件 API 版本化
  - 高风险能力必须声明权限
  - 插件输出结构化结果，不直接改 DOM 或绕过 editor/vault core

### P0.5 推荐迁移顺序

1. 冻结现有编辑器行为测试：live preview、table、frontmatter、wiki link、list continuation、rich content、math、diagram、image。
2. 从 `src/renderer/src/editor/livePreview/*` 抽出 `editor-core` 纯函数和 projection schema。
3. 重写 CodeMirror adapter，让现有 UI 继续工作但不再承载业务语义。
4. 从 vault 扫描、路径规则、hidden folders、draft/project config 中抽出 `vault-core`。
5. 建立 command registry，统一菜单、快捷键、slash menu、命令面板和插件命令。
6. 建立内部 `plugin-api`，先迁移 Mermaid/KaTeX/outline/backlinks 等内置能力。
7. 做 Swift/AppKit 单文件编辑原型，评估 TextKit adapter 与 native shell 收益。

---

## 已完成版本

### v0.x–v1.x (M0–M1) — 单文件编辑器

- [x] 基于 CodeMirror 6 的 Markdown 编辑器核心
- [x] 打开/保存 Markdown 文件（IPC → Rust fs）
- [x] 800ms 防抖自动保存
- [x] Cmd+S 立即保存
- [x] 语法高亮 (CodeMirror `lang-markdown`)
- [x] Tauri v2 项目骨架（React + Vite + Rust）

### v2.0 (M2–M3) — Live Preview · 主题排版

- [x] **代码块渲染** — 围栏代码块渲染为 styled widget，光标进入还原源码
- [x] **表格渲染** — 表格渲染为交互 widget（hover 行删除、单元格内 Markdown 渲染）
- [x] **Frontmatter 渲染** — YAML frontmatter 渲染为 Properties 面板
- [x] **行内格式渲染** — 粗体、斜体、删除线、行内代码、链接图标的 WYSIWYG 渲染
- [x] **Wiki 链接渲染** — `[[wikilink]]` 渲染为 badge widget，Cmd+Click 跳转
- [x] **任务复选框** — `- [ ]` / `- [x]` 渲染为可点击 checkbox
- [x] **脚注预览** — 脚注引用 hover 显示 tooltip 预览
- [x] 三主题模式（auto / light / dark），跟随系统
- [x] oklch 色彩空间设计 token 系统
- [x] IBM Plex Sans/Mono/Serif 字体，PingFang SC CJK 回退

### v2.1 (M4–M5) — 文件管理 · 窗口框架

- [x] Rust 端 vault 递归扫描（文件夹优先、字母排序）
- [x] 文件树侧边栏（可缩放拖拽分隔线）
- [x] 文件右键菜单：新建笔记/文件夹、重命名、移动、删除（回收站）、复制路径、Finder 中显示
- [x] 隐藏文件夹配置（内置 `.margin` `.obsidian` `.git` `.trash` `.DS_Store`，用户可自定义）
- [x] 移动到对话框（折叠树 + 搜索过滤）
- [x] 自定义标题栏（Tauri `titleBarStyle: Overlay`）
- [x] 状态栏（光标位置、字符/词数、阅读时间、保存状态）
- [x] 日程（Daily Notes）：日历 popover、今日日程快速打开、可配置目录、模板生成

### v2.2 (M6–M7) — 自动更新 · 编辑体验

- [x] Tauri updater 插件集成（检查 → 下载进度 → 安装 → 重启）
- [x] Cmd+K 全局搜索浮层（文件名模糊匹配 + 全文搜索，Tab 切换模式）
- [x] Tab/Shift+Tab 列表缩进/反缩进
- [x] Enter 自动延续列表编号
- [x] 斜杠菜单 `/` 快速插入
- [x] Wiki 链接正文点击跳转
- [x] 表格行 hover 删除按钮
- [x] 表格单元格内 Markdown 行内渲染

### v2.3 — 多标签 · 多窗口

- [x] 文档标签栏（tab strip，脏标记圆点，标签激活排序）
- [x] 多标签文档存储（per-tab draft & conflict）
- [x] 外部文件变更冲突检测（Keep mine / Take disk version）
- [x] 崩溃恢复草稿（每 2s 持久化到 `.margin/drafts/`，重开时提示恢复/丢弃）
- [x] 路径变更期间保存协调（rename/move/trash 阻塞旧路径写入）
- [x] 对等多窗口支持（Cmd+Shift+N 创建空白窗口，亦可指定文件打开）
- [x] 跨窗口事件同步（设置、主题、文件保存、路径变更）
- [x] 多 vault 同时打开（不同窗口不同 vault，互不干扰）

### v2.4 — 富内容扩展

> 目标：将代码块扩展为可视化图表渲染，支持数学公式，增强图片嵌入体验。
> 完成：2026-06-19

### 2.4.1 图表渲染

- [x] **Mermaid 图表** — `mermaid` 语言标识的代码块使用 Mermaid.js 渲染为 SVG 图表
  - 光标进入块时 widget 隐藏，显示原始源码（复用现有 `StateField` 方案）
  - 渲染失败 fallback 显示原始代码块 + 行内错误提示
  - 支持 flowchart、sequence、class、state、gantt、pie 等常用图表类型
  - 缩放适配（overflow scroll / fit width toggle）
- [x] **PlantUML 图表** — `plantuml` 语言标识渲染为图形
  - 默认使用 PlantUML Server 远程渲染（可配置自建 Kroki 服务地址）
  - 渲染结果缓存（按源码 hash），避免重复网络请求
  - 离线降级：无网络时显示「需要网络」占位提示
- [x] **Graphviz / DOT** — `dot` 语言标识，通过 Kroki 或本地 Viz.js 渲染
  - 优先级低，作为 PlantUML 基础设施的延伸

### 2.4.2 数学公式

- [x] **行内公式** — `$...$` 语法使用 KaTeX 渲染为行内 widget
- [x] **块级公式** — `$$...$$` 语法渲染为块级 widget（居中、带编号可选）
- [x] **编辑态切换** — 光标进入公式区域时还原 LaTeX 源码，失焦后渲染
- [x] **KaTeX 打包** — Bundle KaTeX 核心 + 必要字体，避免 CDN 依赖，控制包体积增量 <200KB
- [x] **渲染兜底** — KaTeX 解析失败时原样显示源码（红色波浪下划线提示语法错误）

### 2.4.3 图片增强

- [x] **拖拽/粘贴图片** — 从 Finder 拖入或剪贴板粘贴图片时：
  - 自动复制到 vault 的 `assets/` 目录（可配置目标文件夹）
  - 生成 `![alt](assets/filename.png)` 链接并插入光标位置
  - 文件名冲突时自动追加数字后缀
- [x] **图片尺寸控制** — 支持 `![alt|500](image.png)` 或 `![alt](image.png =500x)` 语法控制显示宽度
- [x] **图片预览浮层** — Cmd+Click 图片在浮层中查看原图（支持缩放、拖拽）

### 2.4.4 其他富内容

- [x] **`<video>` / `<audio>` 嵌入** — markdown 图片语法链接到视频/音频文件时渲染为可播放控件
- [x] **Callout / Admonition** — Obsidian 风格的 `> [!note]` / `> [!warning]` 语法渲染为彩色提示块
  - 内置 note、warning、danger、tip、info、quote 六种类型
  - 支持折叠（`> [!note]-` 默认折叠）
- [x] **高亮语法** — `==highlight==` 渲染为黄色高亮背景

---

## v2.5 — 知识图谱 · 元数据 ⬜

> 目标：强化笔记间的关联能力，让知识网络可见、可导航、可管理。
> 预计：2026 Q4

### 2.5.1 图谱视图

- [ ] **局部图谱** — 当前文档的出入链可视化（节点 = 笔记，边 = `[[wikilink]]`）
  - 中心节点为当前文档，一层展开出入链文档
  - 节点大小按引用次数缩放，hover 显示标题和引用数
  - 点击节点跳转到对应文档
  - 力导向布局 / 径向布局切换
- [ ] **全局图谱** — vault 级别所有笔记的关联网络
  - 节点按文件夹分色
  - 支持缩放、拖拽平移
  - 搜索高亮定位节点
  - 性能：>5000 节点时降低渲染精度（聚合节点 / Canvas 2D 渲染）
- [ ] **图谱侧边栏面板** — 可固定到右侧边栏，与编辑器联动（切换文档时图谱自动聚焦）

### 2.5.2 反向链接增强

- [ ] **带上下文预览** — 反向链接面板不仅展示源文件名，还展示包含链接的段落摘录
- [ ] **未链接提及** — 检测正文中出现的其他笔记标题（即使未用 `[[]]` 语法），提示用户建立链接
- [ ] **链接统计** — 文档底部展示：出链数、入链数、孤岛检测

### 2.5.3 标签系统

- [ ] **标签解析** — 识别 `#tag` 和 frontmatter `tags:` 两种声明方式
- [ ] **标签面板** — 侧边栏展示 vault 所有标签，按使用频次排序（标签云 / 列表双视图）
- [ ] **标签页面** — 点击标签打开虚拟页面，列出所有包含该标签的文档
- [ ] **标签自动补全** — 输入 `#` 时弹出标签自动补全菜单
- [ ] **嵌套标签** — 支持 `#parent/child` 层级标签，面板中树形展示

### 2.5.4 Frontmatter 增强

- [ ] **属性类型识别** — 自动识别日期、列表、布尔、数字等类型，提供对应编辑器组件
  - 日期：date picker
  - 列表：标签式多值输入
  - 布尔：toggle switch
- [ ] **别名 (aliases)** — 支持 frontmatter `aliases: [a, b]`，在文件搜索和 Wiki 链接中可用别名匹配
- [ ] **自定义属性模板** — 在 `.margin/config.json` 中配置默认 frontmatter 字段模板

---

## v2.6 — 品质 · 性能 · 平台 ⬜

> 目标：打磨产品质量，覆盖更多平台，提升大 vault 下的使用体验。
> 预计：2027 Q1

### 2.6.1 性能优化

- [ ] **大文件编辑优化** — >10k 行的 Markdown 文件
  - CodeMirror viewport 虚拟化渲染调优
  - Live Preview decoration 计算增量更新（避免全文重新解析）
  - 语法高亮按需计算（可视区域外延迟解析）
- [ ] **大 vault 扫描优化** — >10k 文件
  - Rust 端目录扫描增量缓存（仅扫描变更子树）
  - 文件树虚拟滚动（React Virtuoso / @tanstack/virtual）
  - 搜索索引预建（启动时后台构建摘要索引，加速全文搜索）
- [ ] **启动性能** — 冷启动到可交互时间优化
  - Tauri 窗口预创建 + 骨架屏
  - 延迟加载非关键模块（图谱、设置面板等）
- [ ] **内存优化** — 监控并减少长时间运行的内存增长
  - CodeMirror StateField 内存泄漏检查
  - 关闭标签时彻底清理 CM6 view 和 store 订阅

### 2.6.2 测试与质量

- [ ] **单元测试覆盖率** — 目标 >80%
  - CM6 扩展单元测试（live preview, decorations, keymaps）
  - IPC handler 测试（Rust 命令 + 前端 invoke mock）
  - Zustand store 测试（文档状态、vault 状态、设置状态）
  - 富内容块 widget 渲染测试
- [ ] **E2E 测试** — 引入 Playwright + Tauri driver（或 WebDriver）
  - 文件打开/编辑/保存完整流程
  - 搜索和文件操作
  - 多标签切换
  - 多窗口场景
- [ ] **错误边界** — React Error Boundary 覆盖所有主要面板
  - 编辑器崩溃不影响侧边栏
  - 单个富内容块渲染失败不影响其他块
  - 错误上报（本地日志 + 可选匿名遥测）

### 2.6.3 无障碍

- [ ] **键盘导航** — 完整键盘可达
  - Tab/Shift+Tab 在面板间切换焦点
  - 快捷键一览面板（`?` 或 `Cmd+/` 弹出）
  - 菜单栏键盘导航
- [ ] **ARIA 标注** — 主要交互元素添加 ARIA label/role
  - 文件树（tree role）
  - 标签页（tablist/tab role）
  - 编辑器区域（textbox role）
- [ ] **屏幕阅读器兼容** — 验证 VoiceOver (macOS) / NVDA (Windows) 可用性
- [ ] **高对比度主题** — 提供高对比度配色方案

### 2.6.4 平台适配

- [ ] **Windows 正式支持**
  - 文件路径处理差异（反斜杠、盘符、大小写不敏感）
  - 原生菜单适配
  - 文件监听 API 差异（notify 在 Windows 上的坑）
  - MSIX / NSIS 安装包
- [ ] **Linux 正式支持**
  - AppImage / deb 打包
  - 桌面环境兼容性（GNOME, KDE, XFCE）
  - 回收站 API 差异（trash crate 兼容性）
  - Wayland 兼容

---

## v2.7 — 导出 · 模板 · 主题 ⬜

> 目标：让笔记可输出、可复用、可个性化，从「编辑工具」走向「写作平台」。
> 预计：2027 Q2

### 2.7.1 导出

- [ ] **PDF 导出**
  - 渲染 Markdown 为排版精美的 PDF
  - 可选页眉/页脚（文件名、日期、页码）
  - 保留代码块语法高亮、表格、图表
  - 字体嵌入（IBM Plex 等非系统字体）
  - 页边距、纸张大小设置
- [ ] **HTML 导出**
  - 独立 HTML 文件（内联 CSS + 图片 base64）
  - 可选包含/排除 frontmatter
  - 保留 Wiki 链接（转换为相对链接或纯文本）
- [ ] **批量导出** — 选中多个文件或整个文件夹导出
- [ ] **复制为格式化文本** — 复制 Markdown 选区，粘贴到其他应用时保留富文本格式（RTF/HTML clipboard）
- [ ] **导出预览** — 导出前实时预览效果

### 2.7.2 模板系统

- [ ] **笔记模板** — 新建笔记时可选模板
  - 模板按文件夹分类（`templates/` 目录）
  - 模板变量：`{{title}}` `{{date}}` `{{time}}` `{{cursor}}`
  - 从右键菜单「新建自模板…」触发
- [ ] **日程模板** — 每日笔记模板支持 `{{yesterday}}` `{{tomorrow}}` 等日期变量
- [ ] **模板片段** — 在编辑器中通过 `/` 斜杠菜单插入预定义片段
  - 内置：会议笔记、读书笔记、周报、项目 README
  - 用户自定义片段（`.margin/snippets/`）
- [ ] **模板市场（可选）** — 社区模板分享（需要后端支持，远期考虑）

### 2.7.3 自定义主题

- [ ] **主题文件格式** — CSS custom properties 驱动的主题定义
  - 定义主题色板、字体、间距等 token
  - 支持 `.margin/themes/*.css` 加载自定义主题
- [ ] **主题编辑器** — 设置面板中的可视化主题编辑（color picker 调色）
- [ ] **内置主题** — 增加 Solarized、Nord、Catppuccin 等经典配色
- [ ] **主题导入/导出** — JSON/CSS 格式的主题文件分享

### 2.7.4 排版增强

- [ ] **自定义字体** — 支持加载 vault 内字体文件（`.margin/fonts/`）或系统字体
- [ ] **行间距 / 段落间距** — 设置面板中的排版调节项
- [ ] **正文宽度** — 可调节编辑器正文栏宽度（readable line length）
- [ ] **首行缩进 / 两端对齐** — 排版偏好选项

---

## v2.8 — 插件架构 ⬜

> 目标：建立插件生态，让社区贡献扩展功能，核心保持精简。
> 预计：2027 Q3

### 2.8.1 插件 API 设计

- [ ] **插件接口定义**
  ```typescript
  interface MarginPlugin {
    id: string
    name: string
    version: string
    description?: string
    author?: string
    activate(ctx: PluginContext): void | Promise<void>
    deactivate(): void | Promise<void>
  }
  ```
- [ ] **PluginContext** — 插件可访问的能力
  - `ctx.editor` — CM6 扩展注册（Extension[], ViewPlugin, StateField, keymap）
  - `ctx.commands` — 注册/调用命令
  - `ctx.sidebar` — 注册侧边栏面板（图标 + 标题 + React 组件）
  - `ctx.settings` — 注册插件设置项（在设置面板中渲染）
  - `ctx.vault` — 只读 vault 信息（路径、文件列表）
  - `ctx.events` — 事件总线（文件打开/关闭/保存/删除、设置变更、窗口焦点）
- [ ] **插件沙箱** — 限制插件对文件系统和网络的能力
  - 声明式权限模型（`permissions: ['fs.read', 'network']`）
  - 敏感操作需用户授权

### 2.8.2 内置插件迁移

将以下现有功能从核心剥离为内置插件（预装但可禁用）：

- [ ] `plugin-outline` — 文档大纲面板
- [ ] `plugin-backlinks` — 反向链接面板
- [ ] `plugin-calendar` — 日程/日历视图
- [ ] `plugin-mermaid` — Mermaid 图表渲染
- [ ] `plugin-math` — KaTeX 数学公式
- [ ] `plugin-templates` — 模板插入
- [ ] `plugin-export` — 导出功能

### 2.8.3 插件管理

- [ ] **插件面板** — 设置中的插件管理页
  - 已安装插件列表（启用/禁用开关、版本、作者、描述）
  - 安装新插件（从本地 `.margin/plugins/` 目录或指定路径加载）
  - 卸载插件
  - 插件错误状态展示
- [ ] **插件热重载** — 开发模式下监听插件文件变更自动重载
- [ ] **插件市场（远期）** — 在线浏览、搜索、一键安装社区插件
  - 需要后端服务（插件仓库 + 审核流程）
  - v2.8 阶段先支持本地安装，市场放到后续版本

### 2.8.4 开发者体验

- [ ] **插件开发模板** — 提供 TypeScript  starter 仓库和文档
- [ ] **插件 API 文档** — 完整的 API reference（JSDoc 生成）
- [ ] **DevTools** — 开发者工具面板
  - 查看已注册插件状态
  - 查看 CM6 StateField 快照
  - 事件流日志
  - 性能火焰图（CM6 transaction 耗时）

---

## v3.0 — 协作 · 同步 · 移动端 ⬜

> 目标：让笔记跨设备、跨团队可用，从「单机工具」走向「知识平台」。
> 预计：2027 Q4+

### 3.0.1 版本历史

- [ ] **Git 集成** — 可选启用 git 版本追踪
  - 自动 commit（可配置间隔：每 5 分钟 / 每次保存 / 手动）
  - 文件历史面板：展示选中文件的 commit 历史
  - **可视化 Diff** — 并排 diff 视图（CodeMirror merge 扩展），高亮增删改，支持回退到历史版本
  - 冲突解决辅助
- [ ] **内置版本历史（非 git）** — 无 git 环境下使用本地快照
  - 保存时自动记录 diff 快照（存储于 `.margin/history/`）
  - 保留策略：最近 50 个版本 + 每天一个快照 + 每周一个快照

### 3.0.2 同步

- [ ] **Vault 同步** — 可选云同步服务
  - 端到端加密（E2EE），密钥仅存本地
  - 增量同步（仅传输变更），减少带宽
  - 冲突处理策略：保留双方版本 + 提示用户手动合并
  - 同步状态指示器
- [ ] **设置同步** — 跨设备同步主题、设置、快捷键、模板（不含敏感信息）

### 3.0.3 移动端

- [ ] **iOS 伴侣 App** — SwiftUI 原生应用
  - 基础 Markdown 阅读/编辑（简化版编辑器，非完整 WYSIWYG）
  - Vault 浏览和文件操作
  - 通过 iCloud / 自建同步访问 vault
  - Quick Capture：快速记录想法到 inbox
  - 分享扩展：从其他 App 分享内容到 Margin
- [ ] **Android 伴侣 App** — Jetpack Compose（视 iOS 版反馈决定）

### 3.0.4 发布

- [ ] **静态站点生成** — 将 vault（或选中文件夹）发布为静态网站
  - 保留 Wiki 链接、图谱（嵌入 JavaScript）
  - 主题选择
  - 一键部署到 GitHub Pages / Vercel / Netlify
- [ ] **Web Clipper** — 浏览器扩展，一键剪藏网页到 Margin vault
  - Markdown 格式保存
  - 自动提取正文（Readability 算法）
  - 支持 Chrome / Firefox / Safari

---

## 技术债务 & 持续改进

以下任务贯穿所有版本，每个版本应分配 20% 时间处理技术债务：

- [ ] **测试覆盖率** — 逐步提升至 >80%（目前 58 个测试文件，覆盖不完整）
- [ ] **性能监控** — 引入性能回归测试（large vault benchmark, large file benchmark）
- [ ] **错误追踪** — 本地崩溃日志 + 可选匿名崩溃报告
- [ ] **文档** — 用户手册、功能说明、开发者贡献指南
- [ ] **CI/CD** — GitHub Actions 自动构建 + 测试 + 发布（多平台 artifact）
- [ ] **国际化 i18n** — 目前仅中文/英文混杂，需统一翻译框架
- [ ] **依赖升级** — 定期升级 Tauri、React、CodeMirror 等核心依赖

---

## 版本路线总览

```
v2.3 (当前)  已完成
    ↓
v2.4 (2026 Q3)  富内容扩展
    ├─ Mermaid / PlantUML 图表
    ├─ KaTeX 数学公式
    ├─ 图片拖拽粘贴 + 尺寸控制
    └─ Callout + 高亮语法
    ↓
v2.5 (2026 Q4)  知识图谱
    ├─ 局部 + 全局图谱视图
    ├─ 反向链接增强（上下文、未链接提及）
    ├─ 标签系统（面板、自动补全、嵌套）
    └─ Frontmatter 类型化编辑
    ↓
v2.6 (2027 Q1)  品质 · 性能 · 平台
    ├─ 大文件/大vault 性能优化
    ├─ 测试覆盖 + E2E
    ├─ 无障碍
    └─ Windows / Linux 正式支持
    ↓
v2.7 (2027 Q2)  导出 · 模板 · 主题
    ├─ PDF / HTML 导出
    ├─ 模板系统 + 片段
    └─ 自定义主题
    ↓
v2.8 (2027 Q3)  插件架构
    ├─ 插件 API + 沙箱
    ├─ 内置功能插件化
    └─ 插件管理面板
    ↓
v3.0 (2027 Q4+)  协作 · 同步 · 移动端
    ├─ Git 版本历史
    ├─ 云同步
    ├─ iOS 伴侣 App
    └─ 静态站点发布
```
