---
title: 自定义 macOS 笔记软件设计与构建 Prompt — Bear × Obsidian
tags: [项目, 笔记软件, spec, prompt]
created: 2026-05-30
---

# 自定义 macOS 笔记软件 — 设计与构建 Prompt

本文档既是**设计 spec**，也是可直接交付给 AI 工程师（或 Claude Code agent）的**构建 Prompt**。
读者：未来执行实现的 AI / 人类工程师。
作者意图：在一份文件内同时表达「做什么」「为什么」「如何做」，使得读者无需追溯任何其他文档即可开始实施。

---

## 0. 一句话定位

> 为个人 Obsidian vault 用户打造的 macOS 原生 Markdown 编辑器，融合 Bear 的内联渲染美学与 Obsidian 的本地 .md + 双链能力，与现有 vault 平行使用，不破坏既有数据。

---

## 1. 目标与非目标

### 1.1 必达目标

1. **数据兼容**：直接读写现有 Obsidian vault 中的 `.md` 文件，不引入任何破坏性 sidecar；与 Obsidian 并存使用时不应导致冲突。
2. **Bear 级编辑体验**：内联 Markdown 渲染、优雅 typography、低延迟输入。
3. **完整文件可见性**：默认在文件树展示所有 dot 文件 / dot 目录（`.obsidian`、`.claude`、`.trash` 等），解决 Obsidian 隐藏目录的痛点。
4. **macOS 原生**：SwiftUI + AppKit，不使用 Web View 或 Electron。
5. **个人单用户**：无需考虑多用户、协作、权限模型。

### 1.2 显式非目标（v0.2+ backlog，本次实现不做）

- Dataview / 查询 DSL / 仪表盘
- Graph view
- 插件 / 扩展机制 / 脚本 API
- 移动端（iOS/iPadOS/Android）
- 任何云同步（依赖用户自身的 iCloud Drive / Git / OneDrive）
- frontmatter 可视化表单编辑
- 全局快捷键快速捕获
- 多窗口 / 编辑器多 tab / 笔记并排
- PDF 嵌入渲染、协作、实时编辑

---

## 2. 技术栈（不可妥协约束）

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 | Swift 5.10+ | 原生 macOS 一等公民 |
| UI 框架 | SwiftUI（容器/导航/列表）+ AppKit（NSTextView + TextKit 2 用于编辑器内核） | SwiftUI 写应用骨架最快；编辑器底层必须用 AppKit / TextKit 2 才能实现 Bear 级精细控制 |
| Markdown 解析 | `swift-markdown`（Apple 官方） | 维护良好、AST 结构清晰；按 token range 应用 attributes |
| 索引 / 检索 | SQLite via `GRDB.swift` | backlinks 表、tag 倒排、FTS5 全文搜索 |
| 文件监听 | `FileManager` + `NSFilePresenter` + `DispatchSource.makeFileSystemObjectSource` | 检测 Obsidian 等外部程序的修改 |
| 沙箱 | **关闭 App Sandbox**（个人工具不上架）；首启请求用户选择 vault 根目录并持久化 security-scoped bookmark | 简化文件访问 |
| 最低系统 | macOS 14 Sonoma+ | TextKit 2 稳定、NavigationSplitView 完整 |
| 分发 | 本地编译，DMG 拖入 Applications | 不走 App Store，不签名公证（仅自用） |

**禁止**：Electron、Tauri、WKWebView 内嵌 CodeMirror、React Native、跨平台 UI 框架。

---

## 3. 数据模型

### 3.1 文件即真相

- 笔记 = `.md` 文件；frontmatter（YAML）保留为文件首部；正文为 Markdown
- **不向 .md 注入任何应用专属字段**（无块 ID、无插件标记）
- 所有派生数据（backlinks、tag index、搜索倒排）只存在于 SQLite 索引中；索引可随时从 vault 重建

### 3.2 索引数据库（SQLite）

存放位置：`~/Library/Application Support/<AppName>/index.sqlite`（不在 vault 内）

核心表：
- `notes(path, title, mtime, size, frontmatter_json)`
- `links(src_path, dst_target, line, context_snippet)` —— `dst_target` 为 wiki link 原始字符串（解析后映射到 path）
- `tags(path, tag, source)` —— `source ∈ {'frontmatter', 'inline'}`
- `fts_notes`（FTS5 虚拟表）：path, title, body

索引策略：
- 首启：扫描整个 vault，进度条 + 后台 actor
- 运行时：FileSystemMonitor 增量更新；debounce 500ms

### 3.3 与 Obsidian 共存

- 不修改 `.obsidian/` 目录中任何文件
- 不修改 `.trash/`、`.git/` 等
- 用户在 Obsidian 中修改文件 → 本应用应自动重载（若当前编辑器无脏状态）
- 本应用修改文件 → Obsidian 端 reload-on-change 行为生效

---

## 4. 编辑器引擎（核心，最复杂模块）

### 4.1 基础

- `NSTextView` + TextKit 2（`NSTextLayoutManager`、`NSTextContentManager`）
- 文档模型：纯 `String`（Markdown 源码） + 单独的 attribute 层
- 渲染：通过自定义 `NSTextLayoutFragment` 与 attribute provider 应用样式

### 4.2 内联渲染规则（Bear 风格语法切换）

**核心机制**：维护「活动段落」概念 —— 光标所在的段落（按 blank line 分割的 block）显示完整 Markdown 源码；其它段落按下表视觉简化。

| 语法 | 活动段落显示 | 非活动段落显示 |
|------|-------------|---------------|
| `# H1` ~ `###### H6` | 完整保留 `#` 前缀 | 隐藏 `#`，行使用 SF Pro Display；H1=28pt/H2=24pt/H3=20pt/H4-6=18pt，全部 bold |
| `**bold**` | 显示 `**` | 隐藏 `**`，文本 weight=semibold |
| `*italic*` | 显示 `*` | 隐藏 `*`，文本 italic |
| `` `code` `` | 显示反引号 | 隐藏反引号，SF Mono 14pt + 浅灰背景 |
| `[[link]]` | 显示 `[[ ]]` | 隐藏 `[[ ]]`，文本染色为 #4A90E2，hover 下划线 |
| `[label](url)` | 显示完整 | 显示 `label`，染色 + hover 下划线 |
| `![alt](path)` | 显示完整 | 行内缩略图（最大宽度 = 编辑区宽度的 60%）；点击放大 |
| `- item` / `1. item` | 显示完整 | `-` 替换为 `•`，数字保留；缩进左移使 marker 对齐 |
| `> quote` | 显示完整 | 隐藏 `>`，左侧加 3pt 灰色竖条，文本灰色 |
| ` ```lang `（代码块） | 显示完整 | 整块用 SF Mono 14pt + 浅灰背景；语言标签悬浮右上角 |
| `#tag` / `#tag/sub` | 显示完整 | 染色为 #5856D6，hover 下划线（点击 = 跳到 tag 视图） |

**实现要点**：
- 当光标位置变化 → 重新计算「活动段落」range → invalidate 涉及行的 layout
- 不修改文档 `String`，所有变换只在 attribute / 自定义 layout fragment 层完成
- 隐藏字符通过 zero advance glyph 实现，避免插入 / 删除时光标位置错位

### 4.3 Typography 规范

- 正文：SF Pro Text 16pt regular，行高 1.55，段间距 8pt
- 标题：SF Pro Display，详见 4.2
- 等宽：SF Mono 14pt
- 颜色（light mode）：正文 `#1D1D1F`，二级文字 `#6E6E73`，强调蓝 `#4A90E2`，tag 紫 `#5856D6`
- 颜色（dark mode）：跟随系统，使用 NSColor system colors
- 编辑区左右 padding：48pt；顶部 32pt；最大文本宽度 760pt（超宽窗口时居中）
- 滚动条：overlay 模式，fade out

### 4.4 输入交互

- `[[` 触发笔记补全 popover：模糊匹配标题，按相关度排序，回车 / 点击选定
- `#` 触发 tag 补全 popover：列出已有 tag，可输入新 tag
- 粘贴 URL 到选中文字 → 自动构成 `[label](url)`
- 拖入图片文件 → 复制到 vault 同目录的 `attachments/`（或全局 `04-资源与素材/图片/`，可配置）+ 插入 `![](相对路径)`
- 性能目标：键入到屏幕响应 < 16ms（60fps）

---

## 5. UI 结构 —— 三栏布局

```
┌─────────────┬─────────────┬─────────────────────────────┐
│ Sidebar     │ Note List   │ Editor                      │
│ (240pt)     │ (260pt)     │ (flexible)                  │
│             │             │                             │
│ [📁 文件]   │  Title 1    │  ┌─────────────────────────┐│
│ [🏷 标签]   │  preview... │  │  Title (editable)       ││
│             │  date       │  ├─────────────────────────┤│
│ ▸ 01-日历   │ ─────────── │  │                         ││
│ ▸ 02-项目   │  Title 2    │  │  Markdown content       ││
│ ▾ 03-领域   │  preview... │  │  with inline rendering  ││
│   ▸ 工作    │  date       │  │                         ││
│   ▸ 投资    │             │  ├─────────────────────────┤│
│ ▸ 04-知识   │             │  │ 📎 反向链接 (3) ▾       ││
│ ▸ .obsidian │             │  │   - [[note A]] : ...    ││
│ ▸ .claude   │             │  └─────────────────────────┘│
└─────────────┴─────────────┴─────────────────────────────┘
```

### 5.1 左栏

- 顶部 segmented control：「📁 文件」 / 「🏷 标签」
- **文件 tab**：完整文件树。**默认显示所有 dot 文件 / dot 目录**。右键菜单：新建笔记 / 新建文件夹 / 重命名 / 在 Finder 中显示 / 删除（移到系统 Trash）。
- **标签 tab**：嵌套 tag 树。来源 = frontmatter `tags` ∪ 正文 `#tag`。`/` 分隔嵌套。每节点右侧显示笔记计数。点击 = 中栏切换为「带该 tag（及其子 tag）的笔记列表」。
- 宽度可拖拽 [180, 360]，持久化到 UserDefaults。

### 5.2 中栏（笔记列表）

- 显示当前选中文件夹 / tag 下的笔记
- 每行：标题（18pt）+ mtime（12pt 灰）+ 摘要前 2 行（13pt 灰，单行省略）+ 可选 tag chips
- 默认排序：mtime 倒序；菜单可切换 标题 / 创建时间
- 选中态：浅蓝背景（系统强调色 alpha 0.15）
- 宽度可拖拽 [200, 400]，持久化

### 5.3 右栏（编辑器）

- 顶部 toolbar（高度 44pt）：
  - 左侧：可点击编辑的笔记标题（= 重命名；回车确认；ESC 取消）
  - 右侧：📎 按钮 toggle 底部 backlinks 抽屉；⋯ 按钮含「在 Finder 中显示」「复制 wiki link」
- 主体：编辑器（详见 §4）
- 底部 backlinks 抽屉：折叠时高度 32pt（仅显示 "📎 反向链接 (N)"）；展开时高度 240pt（可拖拽），列出引用笔记 + 引用上下文片段；点击跳转

### 5.4 窗口

- 最小尺寸 900 × 600
- 默认尺寸 1280 × 800
- 三栏宽度 + 窗口 frame 持久化到 UserDefaults
- 暗黑模式跟随系统

---

## 6. 双链与 Backlinks

### 6.1 链接解析

- `[[note title]]` —— 按笔记 title（= 文件名去扩展名 / frontmatter `title` 字段，后者优先）匹配
- `[[path/to/note]]` —— 按相对路径匹配（兼容 Obsidian 设置）
- `[[note#heading]]` —— 跳转到 heading
- `[[note^block]]` —— 暂只跳转到笔记（不实现 block 级跳转）

### 6.2 跳转行为

- 单击 wiki link：在当前编辑器替换为目标笔记
- Cmd-单击：本期不区分，等同左单击（多 tab 已在非目标列表 §1.2）
- 不存在的目标：点击 = 在 `06-收集箱/` 新建该笔记

### 6.3 Backlinks 面板

- 数据：从 `links` 表查询所有 `dst_target` 解析到当前笔记的记录
- 每条显示：源笔记标题（粗体）+ 路径（小灰字）+ 引用所在段落 snippet（最多 2 行）
- 点击 = 跳转到源笔记并定位到该段落
- 索引更新延迟：链接保存后 < 2s 内反映

### 6.4 重命名传播

- 重命名一篇笔记 → 弹窗：「检测到 N 处 `[[old]]` 引用，是否一并更新？」 [更新 / 跳过 / 取消]
- 更新行为：在所有引用文件中将 `[[old]]` 替换为 `[[new]]`；保留 alias 形式 `[[new|old]]`（可选，默认不加 alias）

---

## 7. Tag 系统

### 7.1 来源

- frontmatter：`tags: [a, b/c]` 或 `tags:\n  - a\n  - b/c`
- 正文：`#tag` 或 `#tag/sub/sub2`，紧贴 `#` 不含空格，遵循 Bear 规范
- 两者合并去重；同一笔记可同时有两种来源

### 7.2 嵌套与展示

- `/` 分隔层级
- 侧边栏 tag 树自动构建；空中间节点（如只存在 `a/b/c` 时的 `a`、`a/b`）视为存在
- 节点右侧 badge：该节点及所有子孙节点下的笔记总数

### 7.3 不写入 vault

- 应用不向 .md 注入任何 tag 元数据
- tag 树纯由索引派生；删除一篇笔记或修改其内容后，tag 树自动反映

---

## 8. Cmd-K 命令面板

### 8.1 触发与外观

- 全局快捷键 `Cmd-K`（仅本应用窗口聚焦时）
- 居中弹窗，宽度 600pt，下拉列表最多 8 条结果
- 输入框 + 模糊匹配（fzf 风格高亮命中字符）

### 8.2 候选源

按相关度排序混合：
1. 笔记标题匹配（含 frontmatter title 与文件名）
2. 命令匹配（`新建笔记` / `打开 vault 设置` / `重建索引` / `复制 wiki link` / `在 Finder 中显示` 等）
3. 路径匹配（如输入 `02-项目/` 列出该目录下笔记）

### 8.3 默认行为

- 选中候选 + 回车 → 执行（打开笔记 / 执行命令）
- 无匹配 + 回车 → **新建笔记到 `06-收集箱/`**，文件名 = 输入文本，立即聚焦编辑器
- ESC 关闭

### 8.4 与系统快捷键不冲突的其它快捷键

| 操作 | 快捷键 |
|------|--------|
| 命令面板 | Cmd-K |
| 新建笔记（当前目录） | Cmd-N |
| 全文搜索 | Cmd-Shift-F |
| 保存（手动，平时 auto） | Cmd-S |
| 切换 backlinks 抽屉 | Cmd-Shift-B |
| 切换侧边栏 | Cmd-1 |
| 切换标签视图 / 文件视图 | Cmd-2 |
| 跳转到上一篇 / 下一篇 | Cmd-[ / Cmd-] |

---

## 9. 文件系统行为

### 9.1 监听外部变更

- 用 `DispatchSource.makeFileSystemObjectSource` 监听 vault 根目录递归变化
- 检测到当前打开笔记的外部修改 → 若编辑器无脏状态：静默重载；若有脏状态：toolbar 显示「文件已被外部修改」提示，用户可手动选择「保留我的版本」/「丢弃并重载」

### 9.2 保存策略

- 失焦自动保存（debounce 1s）
- Cmd-S 立即保存
- 关闭窗口 / 退出应用：保存所有脏状态

### 9.3 新建 / 重命名 / 删除

- 命令面板新建 → `06-收集箱/`
- 侧边栏右键新建 → 当前文件夹
- 重命名 = toolbar 标题处直接编辑（双击或回车进入编辑态）；自动处理 `[[link]]` 传播（§6.4）
- 删除 = 移至系统 Trash（`NSWorkspace.recycle`），不直接 unlink

---

## 10. 性能与验收

| 指标 | 目标 |
|------|------|
| 冷启动到 UI 出现（~1000 笔记 vault） | < 1.5s |
| 首次全量索引完成 | < 30s（后台，UI 已可用） |
| 编辑器键入响应（屏幕反映） | < 16ms |
| 切换笔记 | < 100ms |
| 全文搜索结果首条返回 | < 200ms |
| 链接保存后 backlinks 更新 | < 2s |
| Typography 主观与 Bear 对比 | 用户可接受（验收时人工对比） |

---

## 11. 实施路线（建议拆解给 writing-plans）

1. **M1 骨架**：SwiftUI 三栏 + 文件树（含隐藏目录）+ 中栏 list + 简易 `NSTextView`（无 Markdown 渲染）+ 文件读写
2. **M2 索引层**：GRDB + SQLite schema + 全量扫描 + 增量监听 + FTS5 搜索（接 Cmd-Shift-F）
3. **M3 编辑器内联渲染**：swift-markdown 集成 + 活动段落机制 + 标题 / 强调 / 代码 / 列表 / 引用样式
4. **M4 双链**：`[[` 补全 + 跳转 + backlinks 面板 + 重命名传播
5. **M5 Tag**：识别 + 侧边栏标签 tab + 跳转
6. **M6 Cmd-K**：命令面板 + 模糊匹配 + 命令注册表
7. **M7 打磨**：图片支持、暗黑模式微调、typography 对比 Bear 调参、性能优化

---

## 12. 给 AI 工程师的执行约束

阅读到这里的执行者请遵守：

1. **不要引入额外依赖**而不说明理由；§2 表格之外的依赖（如 RxSwift、ComposableArchitecture、Realm）需先与用户确认
2. **不要使用 WebView 任何形式实现编辑器**；这是显式架构决定，违反等同重写
3. **不要修改 vault 中 `.obsidian/` 内容**；如需保存应用设置，写入 `~/Library/Application Support/`
4. **不要在 .md 文件中注入应用专属字段**（块 ID 等）；任何派生数据进 SQLite
5. **遇到与 §1 ~ §11 设计冲突的实现选择**，应在 PR / commit message 中明确指出冲突并请用户裁决；不静默调整
6. **每个 milestone 完成时**，提供 30 秒以内的演示视频或截图序列，证明该 milestone 的功能可见可用
7. **测试**：M2 索引层、M4 双链、M5 Tag 必须有单元测试覆盖核心解析逻辑；UI 层可选
8. **代码组织**：建议模块拆分 `App / UI / Editor / Index / FileSystem / Models`，每模块独立 target 或 framework

---

## 13. 待澄清 / 后续决策

以下项在本 spec 阶段未最终决定，留待实施时与用户对齐：

- 图片附件默认目录：当前笔记同目录 `attachments/`，还是全局 `04-资源与素材/图片/`？（默认前者，可后续加入设置项）
- 笔记标题来源优先级：frontmatter `title` > 文件名首个 `# heading` > 文件名？（默认按此顺序）
- 应用名 / icon：尚未命名（仅自用，可后定）
- 暗黑模式色板细节：跟随系统优先，自定义微调留 v0.2

---

## 14. 来源

本 spec 通过 `/superpowers:brainstorming` 一轮对话生成。
关键决策记录：
- 数据关系：完全兼容现有 vault
- 平台：仅 macOS
- 编辑器风格：Bear 式原生 Markdown + 内联渲染
- 重型能力：仅保留 backlinks（弃 Dataview / Graph / 插件）
- 导航：文件树 + 默认显示隐藏目录
- 技术栈：SwiftUI + AppKit（NSTextView + TextKit 2）
- 布局：三栏
- MVP 额外：Cmd-K 命令面板 + inline #tag 树
