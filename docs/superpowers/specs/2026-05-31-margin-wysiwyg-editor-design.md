---
title: Margin v2 — Typora 式所见即所得 Markdown 编辑器(Electron 重构)
tags: [项目, 笔记软件, spec, redesign, electron]
created: 2026-05-31
supersedes: 2026-05-30-margin-editor-redesign.md, 2026-05-30-bear-obsidian-mac-editor-design.md
status: approved
---

# Margin v2 — 设计 Spec

## 0. 背景与本次重构的性质

旧版 Margin 是一个**原生 macOS Swift 应用**(SwiftUI + AppKit + TextKit 2,GRDB +
swift-markdown),已实现到 M3.8(主题、标题栏、文件树、块级 fragment 外壳)。实现效果
不符合预期,故**完全切换技术栈**,基于 Electron + Web 技术重建。

本次为**平台级重写**,不是增量改造:

- 旧 Swift 版本完整备份到分支 `archive/swift-textkit-v1`(含全部 `docs/`)。
- `main` 清空旧 Swift 代码、Xcode 工程与旧 `docs/`,重建为 Electron 脚手架。
- 旧设计文档的**数据模型与产品约束**(markdown 单源、Obsidian 互通)被继承;**编辑器
  引擎、UI 框架、平台**全部更换。

> 注意:旧 spec §1 中"禁止 WebView 实现编辑器"的约束,因平台切换到 Electron 而**作废**
> ——这是用户明确的决定。

## 1. 一句话定位

一个 **Typora 式所见即所得的 Markdown 编辑器**,Electron 桌面应用,Bear 视觉语言;
markdown 文本为唯一真相,与 Obsidian 逐字互通。

## 2. 北极星与不可妥协约束(继承,不变)

- **markdown 文本 = 唯一真相**,编辑往返**逐字无损**(无序列化损耗)。
- **Obsidian 互通**:`.md` 文件**不注入任何应用专属字段**(无 block ID、无 sidecar);
  不修改 `.obsidian/`、`.trash/`、`.git/`。
- **本地优先**:只操作本地文件,无云、无账号、无遥测。
- 忽略 dotfiles 与隐藏目录,不展示、不写入。

## 3. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | Electron | main + preload + renderer 三进程模型 |
| UI | React 18 + TypeScript | |
| 构建 | Vite | electron-vite 或等效模板 |
| 样式 | Tailwind + shadcn/ui | 主题色走 CSS 变量(oklch) |
| 状态 | Zustand | 多个聚焦 store |
| 编辑器内核 | **CodeMirror 6** | `@codemirror/lang-markdown` + 自建 Live-Preview 装饰层 |

> BlockNote 在选型阶段被评估并**排除**:其真相是块 JSON、markdown 为有损导出,与"markdown
> 单源 + Typora 观感"两条北极星结构性冲突。详见 §11 选型记录。

## 4. 编辑器内核选型理由(CodeMirror 6 + Live-Preview)

候选对比(维度:markdown 保真度 / Typora 观感 / 开发成本 / 生态成熟度):

| 方案 | 保真度 | Typora 观感 | 成本 | 生态 | 结论 |
|---|---|---|---|---|---|
| BlockNote | ✗ 有损导出 | ✗ Notion 块式 | ✓ 低 | ✓ | 哲学冲突,排除 |
| Milkdown/Crepe | ◐ remark,非逐字 | ◐ 接近 | ◐ 中 | ◐ | 次选 |
| **CodeMirror 6 + 装饰** | **✓✓ 文本即真相** | **✓✓ 最契合** | ◐ 自建渲染层 | ✓✓ | **主选** |

选择 CM6 的核心理由:

1. **文本即真相** —— `EditorState.doc` 字面上就是 markdown 字符串,往返**天然逐字无损**,
   Obsidian "不注入字段"约束**自动满足**,零序列化风险。
2. **Typora 标志交互天然契合** —— "光标所在行显示裸语法、其余行隐藏并就地渲染"正是 CM6
   装饰系统按光标位置驱动的标准做法(Obsidian Live Preview 即此实现)。
3. **成熟、高性能、中文友好** —— 大文档无压力;IME/CJK 支持好(交互稿为中文);代码块
   原生语言高亮。

代价:Live-Preview 渲染层需自建。因 v1 范围聚焦,装饰集有限且明确,工作量可控。

## 5. 架构与数据流

### 5.1 进程职责

```
┌─ Main 进程 ──────────────────────┐    IPC(contextBridge)    ┌─ Renderer(React)────────┐
│ • 打开文件夹/文件对话框           │ ◄────── 类型化 API ──────► │ • React UI(shadcn 外壳)  │
│ • 文件读 / 写(fs)               │                          │ • Zustand stores          │
│ • 文件夹递归扫描 → 文件树         │                          │ • CodeMirror 6 编辑器     │
│ • fs.watch 监听外部改动           │                          │                           │
└───────────────────────────────────┘                          └───────────────────────────┘
```

- Renderer **不直接访问 fs**;一切文件操作经 preload 暴露的类型化 IPC。
- `nodeIntegration: false`、`contextIsolation: true`、`sandbox` 视脚手架而定。

### 5.2 IPC 契约(初版)

| 方向 | 通道 | 入参 → 出参 |
|---|---|---|
| R→M | `dialog:openFolder` | () → `string \| null`(目录路径) |
| R→M | `dialog:openFile` | () → `string \| null` |
| R→M | `vault:scan` | `rootPath` → `TreeNode[]` |
| R→M | `file:read` | `path` → `string` |
| R→M | `file:write` | `{path, content}` → `void` |
| M→R | `file:externalChange` | `{path, content}`(fs.watch 推送) |

### 5.3 核心数据流(单一真相)

```
键入 → CM6 doc(markdown 字符串)变更
        ├→ Live-Preview 装饰重算(光标感知,view 层)
        ├→ Zustand documentStore: dirty=true
        ├→ StatsCalculator 重算(字符/词/分钟/块)→ 状态栏
        └→ debounce(~800ms)自动保存 → IPC file:write → Main 写盘 → dirty=false

外部改动 → Main fs.watch → IPC file:externalChange
        → 若当前未脏:静默重载 doc
        → 若当前脏:提示用户(保留本地 / 加载磁盘)
```

- 全部同步解析,单文件;性能目标:< 10k 字符笔记,装饰重算 ≤ 16ms/帧。

## 6. 编辑器内核细节(v1 最大工作量)

### 6.1 真相与装饰分离

- 真相:`EditorState.doc`(原始 markdown 文本)。
- 装饰:一个**光标感知的 `ViewPlugin`**,消费 `@codemirror/lang-markdown` 的 Lezer 语法树,
  产出 `DecorationSet`。装饰**只影响显示,不改文本**。

### 6.2 装饰类型

- **replace 装饰** —— 在**非光标行/块**隐藏裸语法标记:`#`、`**`、`*`、`~~`、`` ` ``、
  `>`、列表 marker 等。
- **mark 装饰** —— 行内样式:标题字号、粗体、斜体、删除线、行内代码底色。
- **line 装饰** —— 引用左金条、代码块底色面板、标题行排版。
- **widget 装饰** —— 分隔线(`---` → 横线 widget)、任务清单(`- [ ]` → 可点复选框)。

### 6.3 光标感知还原(Typora 机制)

- 监听 `EditorState.selection`。
- 光标/选区所覆盖的**行(或所属块)**:还原显示裸语法(供编辑);其余:隐藏并渲染。
- 块级元素(代码围栏、引用、列表项)以**所属块**为还原粒度,避免编辑时跳动。

### 6.4 v1 覆盖范围(核心集)

**做**:标题(H1–H6)、粗体、斜体、删除线、行内代码、链接、无序/有序/任务列表、引用、
代码围栏(带语法高亮)、分隔线。

**降级处理**:表格、内联图片 —— 光标离开时**退回显示源码**(或极简渲染),富渲染留 v2。

### 6.5 代码块高亮

- 代码围栏内按 info string 语言用 CM6 语言包做高亮(常见语言;未知语言纯文本)。
- v1 不做行号、不做复制按钮(留 v2)。

## 7. Bear 主题与排版

- **调色板**:oklch(暗色 + 暖金 accent),从交互稿 `:root` 提取 → CSS 变量。CM6 主题与
  React UI **共用同一组 CSS 变量**,保证一致。
  - 关键值(暗色,继承交互稿):bg `0.165/0.006/70`、bg-panel `0.205`、text `0.905`、
    accent 暖金 `0.82/0.11/90`;派生 accent-soft(α .14)/accent-line(α .32)/sel(α .20)。
- **字体**:IBM Plex(Sans/Mono/Serif)随包打包(`resources/fonts/`);缺失优雅降级到
  system-ui / SF Mono / Georgia。首期 weight 400/500/600。
- **排版**:正文 16pt、行距 1.72、段间距 8pt;标题比例 H1 1.62em / H2 1.32em / H3 1.1em;
  编辑区最大宽 720pt,上下 padding 56/40pt。
- **范围**:v1 只做**暗色 + 暖金**;亮色与其余 4 色 accent 留 v2。

## 8. 外壳组件

### 8.1 文件树侧栏
- 打开文件夹 → `vault:scan` 递归扫描 → 树形浏览,点击切换 `.md`。
- 忽略 dotfiles/隐藏目录。
- 行外观参考交互稿:行高、缩进、`.md` 图标(暖金)、文件夹图标、选中态
  (accent-soft 底 + accent-line 边)、hover(bg-hover)。

### 8.2 标题栏
- 面包屑 `<父目录名> / <文件名>`,文件名截断;脏点 ●(accent),`dirty` 时显现。
- 右侧按钮:侧栏切换 + 主题占位(v1 暗色固定,按钮可先 disabled)。

### 8.3 状态栏
- 左:`<n> 字符`、`<n> 词`、`约 <n> 分钟`。
- 右:`<n> 块`、保存状态(已保存 / 保存中…)。
- 统计规则:CJK 字数 `[一-鿿぀-ヿ가-힯]` 计数;英文词
  `[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*` 计数;分钟 `max(1, round(总词/320))`;块数 = 顶层
  markdown 块数。debounce 200ms。

## 9. 项目结构(建议)

```
margin/
├─ electron/
│  ├─ main.ts              窗口、生命周期
│  ├─ preload.ts           contextBridge 暴露类型化 API
│  ├─ ipc.ts               通道常量 + 类型
│  ├─ fileWatcher.ts       fs.watch 封装
│  └─ vaultScanner.ts      递归扫描 → TreeNode[]
├─ src/
│  ├─ editor/
│  │  ├─ setup.ts          CM6 EditorState/View 装配
│  │  ├─ livePreview/      装饰 ViewPlugin(replace/mark/line/widget)
│  │  ├─ markdownTheme.ts  CM6 主题(读 CSS 变量)
│  │  └─ codeHighlight.ts  代码围栏语言高亮
│  ├─ stores/
│  │  ├─ documentStore.ts  当前文件路径/内容/dirty/保存状态
│  │  ├─ vaultStore.ts     根目录/文件树/选中
│  │  ├─ themeStore.ts     主题模式(v1 固定暗色)
│  │  └─ uiStore.ts        侧栏开合等
│  ├─ components/
│  │  ├─ FileTree/         侧栏 + 行渲染
│  │  ├─ TitleBar/
│  │  ├─ StatusBar/
│  │  ├─ Editor/           CM6 React 挂载封装
│  │  └─ ui/               shadcn 组件
│  ├─ theme/
│  │  ├─ tokens.ts         oklch → CSS 变量
│  │  └─ fonts.ts          IBM Plex 加载
│  └─ App.tsx
├─ resources/fonts/        IBM Plex *.woff2/*.ttf
└─ docs/
   ├─ design/              交互稿副本(Margin.html + project/)
   └─ superpowers/specs/   本 spec
```

## 10. 分阶段路线(每阶段独立 PR + 验收)

| 阶段 | 交付 | 依赖 |
|---|---|---|
| **M0** | 仓库初始化:备份分支 + 清空 + Electron/Vite/React/TS/Tailwind/shadcn 脚手架跑通;交互稿复制进 `docs/design/` | — |
| **M1** | CM6 接入;单文件打开/编辑/保存(纯源码,无装饰);IPC 文件读写 | M0 |
| **M2** | Live-Preview 装饰层(核心集)+ 光标感知还原 + 代码块高亮 | M1 |
| **M3** | Bear 主题(暗+暖金)+ IBM Plex 排版 + 720pt 版心 | M1 |
| **M4** | 文件树侧栏(打开文件夹 + fs.watch 外部改动重载) | M1 |
| **M5** | 标题栏 + 状态栏 + 统计 | M3 |

## 11. 关键决策记录

- 平台从原生 Swift/TextKit 2 → **Electron** Web 栈(用户决定;旧"禁止 WebView"约束作废)。
- 编辑器内核 **CodeMirror 6 + 自建 Live-Preview**,排除 BlockNote(哲学冲突)、次选
  Milkdown/Crepe。
- 目标缩小到**所见即所得 markdown 编辑器**;放弃旧版的完整 vault 工具范围。
- markdown 单源 + Obsidian 逐字互通两条北极星不变。
- v1 范围:编辑内核 + Bear 主题 + 文件树 + 标题/状态栏;进阶功能后置。

## 12. 显式非目标(v1 不做)

- Cmd-K 命令面板
- 双链 `[[wiki]]` 与自动补全
- `#tag` 内联高亮
- 全文搜索 / 索引(无 SQLite)
- 块拖动重排
- `/` 斜杠菜单、块库抽屉
- 亮色主题、5 色 accent 切换
- 表格 / 内联图片富渲染
- 设置面板

## 13. 待澄清

- IBM Plex 字体文件来源:用户自备放入 `resources/fonts/`(实现计划列出确切文件清单)。
- Electron 脚手架模板具体选型(electron-vite vs 自搭):M0 实现计划阶段定。
- 自动保存策略默认 debounce ~800ms,可在实现时按手感调整。
