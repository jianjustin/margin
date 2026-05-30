---
title: Margin 编辑器重构 — 基于交互稿
tags: [项目, 笔记软件, spec, redesign]
created: 2026-05-30
supersedes: 2026-05-30-bear-obsidian-mac-editor-design.md §4, §5
---

# Margin 编辑器重构 — 设计 Spec

本 spec 是对原始设计文档（`2026-05-30-bear-obsidian-mac-editor-design.md`）的**增量替换**：
保留数据模型、Obsidian 兼容、技术栈选择等所有约束，**重写** §4（编辑器引擎）与 §5（UI 结构）以对齐用户提供的高保真交互稿（`/tmp/margin-design/margin/project/Margin.html`）。

实施者按本 spec 优先；冲突时本 spec 胜过原文档相关章节。

---

## 0. 一句话定位

Bear 级所见即所得的单 NSTextView 编辑器内核 + Notion 级块视觉外壳；纯标准 Markdown 单源；与 Obsidian 完全互通。

---

## 1. 不可妥协约束（不变）

源自原 spec §2：
- 语言 Swift 5.10+，UI 框架 SwiftUI + AppKit（NSTextView + TextKit 2）
- 解析 `swift-markdown`；索引 GRDB/SQLite；监听 `DispatchSource`
- 沙箱关闭；macOS 14+
- **禁止 WebView 任何形式实现编辑器**
- **`.md` 文件不注入任何应用专属字段**（无 block ID、无 sidecar）
- 不修改 `.obsidian/`、`.trash/`、`.git/`

---

## 2. 总览：架构与数据流

### 2.1 单一真相
- 内存中文档模型 = `String`（标准 Markdown），唯一可信源
- 任何块级 / 视觉状态（拖动状态、hover 高亮、活动段落）只活在 UI 层
- 外部应用修改文件 → `FileWatcher` → 重新载入 String → 重新解析渲染（机制不变）

### 2.2 编辑器内核
- 仍用**单一 `NSTextView`**：IME 稳定、撤销栈天然、复制粘贴 / 光标移动免维护
- 从"只着色"升级到"属性着色 + TextKit 2 块级片段"：
  - 每个 Markdown 块（heading / paragraph / quote / code / list item / divider）对应一个 `NSTextLayoutFragment`
  - Fragment 负责块级装饰：左侧 hover 出现的拖动手柄、quote 左金条、code block 灰底圆角 + 顶部 header view、divider 横线
- "活动段落显原始语法、其余隐藏"机制保留（M3 已实现）

### 2.3 模块拆分
```
Sources/Margin/
├─ Theme/                  ← 新增（M3.5）
│   ├─ Palette.swift           oklch 调色板 → NSColor
│   ├─ FontStack.swift         IBM Plex 注册 + 字体解析
│   └─ ThemeStore.swift        @Observable，持久化到 UserDefaults
├─ Editor/
│   ├─ Typography.swift        改：读 ThemeStore（M3.5）
│   ├─ MarkdownStyler.swift    改：读 ThemeStore（M3.5）；剥离块级装饰（M3.8）
│   ├─ BlockChrome.swift       新增（M3.8）：NSTextLayoutFragment 子类
│   ├─ HoverTracker.swift      新增（M3.8）：NSTrackingArea → fragment hover
│   ├─ StatsCalculator.swift   新增（M3.6）：字数/词数/分钟/块数
│   ├─ RangeConverter.swift    保留
│   └─ ActiveParagraph.swift   保留
├─ UI/
│   ├─ TitleBar.swift          新增（M3.6）
│   ├─ StatusBar.swift         新增（M3.6）
│   ├─ FileTreeRow.swift       新增（M3.7）：替换 FileTreeView 行渲染
│   ├─ EditorView.swift        改：去掉自带 toolbar（让位给 TitleBar）
│   ├─ RootView.swift          改：注入 ThemeStore，包裹 TitleBar/StatusBar
│   └─ ...
```

### 2.4 数据流
```
键入
 └→ NSTextView 字符串变更
     └→ Coordinator.textDidChange
         ├→ swift-markdown 重解析（增量优化留 M7 后期）
         ├→ MarkdownStyler 重算 NSAttributedString
         ├→ BlockChrome 重算 fragment 装饰几何（M3.8 之后）
         └→ StatsCalculator 重算字数/块数 → StatusBar 刷新
```
- 全部同步，单文件解析；现 spec 性能目标 < 16ms 仍可达成（< 10k 字符的笔记 ≤ 5ms）
- 主题切换：`ThemeStore` 推送 → 全文一次性重算属性（≈ 10ms 量级）

---

## 3. 主题体系（M3.5）

### 3.1 调色板

源自交互稿 `margin.css :root`，所有色用 oklch 定义，运行时转 sRGB → NSColor。

**暗色（默认）**：
| 角色 | oklch |
|------|-------|
| bg | 0.165 / 0.006 / 70 |
| bg-panel | 0.205 / 0.006 / 70 |
| bg-elev | 0.245 / 0.007 / 70 |
| bg-hover | 0.275 / 0.008 / 70 |
| border | 0.305 / 0.006 / 70 |
| border-soft | 0.255 / 0.006 / 70 |
| text | 0.905 / 0.01 / 85 |
| text-dim | 0.66 / 0.01 / 80 |
| text-faint | 0.49 / 0.01 / 80 |
| accent (warm gold) | 0.82 / 0.11 / 90 |
| accent-ink | 0.30 / 0.05 / 80 |

**亮色**：对应 `[data-theme="light"]`，同样 oklch 表达。

**派生色（运行时计算）**：
- `accent-soft = accent.withAlphaComponent(0.14)`
- `accent-line = accent.withAlphaComponent(0.32)`
- `sel       = accent.withAlphaComponent(0.20)`

5 种 accent（warm gold / terracotta / indigo / moss / violet）首期只实装 warm gold；其余留 v2。

### 3.2 字体栈

| 字族 | 主字体 | 回退链 |
|------|--------|--------|
| UI | IBM Plex Sans + IBM Plex Sans SC | system-ui, "PingFang SC", sans-serif |
| Mono | IBM Plex Mono | "SF Mono", Menlo, monospace |
| Serif | IBM Plex Serif | Georgia, serif |

字体文件 (`*.ttf`) 放 `Sources/Margin/Resources/Fonts/`，通过 xcodegen 打包，启动时用 `CTFontManagerRegisterFontsForURL` 注册。

**首期只打包 weight 400/500/600**（Sans/Mono/SansSC），Serif 只 400/500；Italic 仅 Sans 400。

文件缺失时**优雅降级**到回退链，不阻断启动。

### 3.3 字号与排版
- 正文 16pt（可调 14/15/16/17/18），行距 1.72，段间距 8pt
- 标题 em 比例：H1 = 1.62em / H2 = 1.32em / H3 = 1.1em（继承当前 typography 思路）
- 编辑区最大文本宽度 720pt（来自交互稿 `--editor-width`），上下 padding 56/40pt

### 3.4 持久化

`UserDefaults` keys（新增至 `UserDefaultsKeys`）：
- `themeMode`: `"dark" | "light"`
- `accentIndex`: `0..4`（M3.5 强制 0）
- `editorFontKey`: `"sans" | "mono" | "serif" | "system"`（M3.5 强制 sans）
- `editorFontSize`: `Double`（默认 16）

切换 → 写盘 → 推 `@Observable` → 全 UI 重渲染。

---

## 4. 标题栏 + 状态栏（M3.6）

### 4.1 标题栏
- 高度 38pt，背景 `bg-panel`，底部 1px `border-soft`
- 左：原生交通灯（保留系统绘制；自定义 `NSWindow` 用 `titlebarAppearsTransparent = true` + `titleVisibility = .hidden`）
- 中：面包屑 `<父目录名> / <文件名>` 12.5pt `text-dim`，文件名截断省略；脏点 ● 6pt `accent`，`AppState.dirty` 时透明度由 0 → 1
- 右：4 个 toolbar 按钮（侧栏切换 / 主题切换 / 设置 / 块库抽屉），30×26pt 圆角 6pt
  - M3.5 时：主题切换已可用；侧栏 / 设置 / 块库按钮 disabled 占位（视觉到位但无动作）

### 4.2 状态栏
- 高度 28pt，背景 `bg-panel`，顶部 1px `border-soft`，11.5pt `text-faint`
- 左：`<n> 字符`、`<n> 词`、`约 <n> 分钟`
- 右：`<n> 块`、`已同步 / 保存中…`（accent 色）

### 4.3 统计规则（StatsCalculator）
- 监听 `AppState.noteBody`，debounce 200ms
- CJK 字数：`[一-鿿぀-ヿ가-힯]` 匹配数
- 英文词数：`[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*` 匹配数
- 总词 = CJK + 英文；分钟 = `max(1, round(total / 320))`
- 块数 = swift-markdown 顶层 children 数（含 paragraph / heading / quote / list / code / divider）

---

## 5. 侧栏文件树外观（M3.7）

`FileTreeView` 数据层不动，只重写行渲染 `FileTreeRow.swift`：

- 行高 24pt，左 padding 8pt
- Chevron（folder 12pt，file 隐藏），缩进每层 16pt
- Icon 17×17pt，圆角 4pt：
  - `.md` → `MD` 字符或 SF Symbol `doc.text`，accent 金
  - `.canvas` → `CV`，蓝
  - `.json` → `JSON`，faint
  - 文件夹 → SF Symbol `folder.fill`，accent 金
- 名称 13pt：folder weight 600 / file weight 400
- 子项 badge：文件夹右侧 11pt mono，`bg` 底色，圆角 10pt
- 选中态：`accent-soft` 背景 + `accent-line` 1px 边框
- Hover：`bg-hover` 背景
- Ignored（dotfile 等）：opacity 0.42

---

## 6. 编辑器块级外壳（M3.8）

### 6.1 实现路径
- 实现 `NSTextLayoutManagerDelegate.textLayoutManager(_:textLayoutFragmentFor:in:)`
- 按 block 类型返回 fragment 子类（默认/代码/分隔）
- 每个 fragment 自绘块级装饰

### 6.2 三种 fragment

**`DefaultBlockFragment`**（paragraph / heading / quote / list item / inline 内容）：
- `super.draw` 画文字
- Hover 状态：在 `layoutFragmentFrame` 左 -30pt 处画 ⠿（14pt mono，`text-faint`），透明度 0 → 1 过渡（120ms）
- Quote 块：最左 3pt 圆角金色竖条（替代当前 styler 的 `>` 字符染色）

**`CodeBlockFragment`**：
- 文字区背景 `bg-elev`、1px `border-soft` 边框、圆角 7pt
- 顶部留 28pt 给 header：通过 `NSTextAttachmentViewProvider` 嵌入 SwiftUI `CodeHeader`（语言名按钮 + 复制按钮）
- 文字 mono 13.5pt，padding 12/14pt
- 首期**不接语法高亮**（hljs 留 M7）

**`DividerBlockFragment`**：
- 12pt 上下 padding
- 中线 1pt `border` 色

### 6.3 Hover 检测
- `NSTextView` 子类挂一个 `NSTrackingArea(.mouseMoved | .activeInActiveApp | .inVisibleRect)`
- `mouseMoved` 用 `NSTextLayoutManager.textLayoutFragment(for:)` 找到 fragment → 设置 `hoveredFragmentID` → invalidate 重绘

### 6.4 与现有 styler 的边界调整
- `MarkdownStyler.applyQuote` 移除 `>` 字符染色逻辑（M3.8）
- `MarkdownStyler.applyCodeBlock` 移除 `backgroundColor` 染色（让 fragment 自绘）
- 仍在 styler 层：字号、字体、字色、加粗、斜体、隐藏标记、链接 / wiki / tag 着色

### 6.5 拖动重排
- **M3.8 不实现**。手柄只显视觉，hover 时 cursor 变 `.openHand`，点击无反应
- 真正的拖动重排留 M8

### 6.6 兼容性验收
- 同一 .md 文件用 Obsidian 打开：内容 100% 一致，无任何额外字段
- 外部修改后回到本应用：FileWatcher 触发重载，渲染正确
- IME 中文输入：不被块级装饰打断

---

## 7. 分阶段路线

| 阶段 | 工作量 | 交付 | 依赖 |
|------|--------|------|------|
| M3.5 | 2-3 天 | 主题体系（暗+暖金 + IBM Plex） | 无 |
| M3.6 | 2 天 | 标题栏 + 状态栏 + StatsCalculator | M3.5 |
| M3.7 | 1-2 天 | 文件树行外观重调 | M3.5 |
| M3.8 | 5-7 天 | 编辑器块级外壳（fragments + hover） | M3.5 |
| ... | | M4 双链、M5 Tag、M6 Cmd-K、M7 设置面板、M8 拖动重排、M9 块库抽屉、M10 斜杠菜单 | 顺序见原 spec |

每阶段独立 PR，独立验收文档（`docs/M3.5-verification.md` 等）。

---

## 8. 显式非目标（本次重构不做）

- 拖动重排块（M8）
- 块库抽屉（M9）
- `/` 斜杠菜单（M10）
- Callout 块视觉（不做，统一按 quote 渲染）
- Table / Image 块视觉（保持原始 markdown，无特殊外壳；M9+ 再做）
- 5 种 accent 同时可选（首期仅 warm gold）
- 设置面板（M7）
- 代码块语法高亮（hljs / Splash 接入留 M7）
- 字体设置 runtime UI（M7）

---

## 9. 待澄清

- IBM Plex 字体打包来源：用户自下载并放入 `Sources/Margin/Resources/Fonts/`（plan 会列出确切文件名清单）
- 主题切换按钮位于 TitleBar，但 M3.5 阶段 TitleBar 尚未存在 → M3.5 阶段临时挂在 EditorView 上方，M3.6 迁移走

---

## 10. 来源

本 spec 通过 `/superpowers:brainstorming` 一轮对话从用户提供的交互稿（HTML/CSS/JS）反向提炼而成。
关键决策：
- 视觉先行 + 渐进块化（不全套 block 重构）
- callout 不做（统一 quote）
- 单 NSTextView 内核保留（不切换到"每块一个 view"）
- IBM Plex 字体打包到 app 内（不依赖系统安装）
