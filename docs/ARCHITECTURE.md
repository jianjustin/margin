# Margin — Architecture

> 最后更新：2026-06-23
> 当前版本：**v2.4** (Tauri v2 + React 18 + CodeMirror 6)

Margin 是一款面向 Obsidian vault 的 **Markdown 所见即所得（WYSIWYG）编辑器**：原始 `.md`
文本始终是 source of truth，编辑器在源码之上叠加 live preview——表格、代码块、frontmatter、
公式、图表等渲染为行内/块级 widget，光标进入对应区域时还原源码（Typora 风格）。

本文档描述**当前实现**的分层与边界，配合 [ROADMAP.md](ROADMAP.md) 的演进规划阅读。

---

## 1. 运行时分层

```
┌─────────────────────────────────────────────────────────────┐
│  App Shell  ——  Tauri v2 (Rust)                               │
│  vault 扫描 · 文件 watcher · fs 操作 · 回收站 · updater · 多窗口  │
│  src-tauri/src/{commands,vault_scanner,file_watcher,fs_ops}.rs │
└───────────────▲───────────────────────────────────────────────┘
                │  IPC (invoke / events)  ·  src/shared 类型
┌───────────────┴───────────────────────────────────────────────┐
│  Renderer  ——  React 18 + Vite + Tailwind + Zustand            │
│  components/ · hooks/ · stores/ · lib/api.ts                    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  editor-core  ——  平台无关编辑器内核（见 §3）            │    │
│   │  projection（parse→render model） + commands（纯编辑）   │    │
│   └──────────────────────────────────────────────────────┘    │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  editor/  ——  CodeMirror 6 adapter（见 §4）             │    │
│   │  livePreview 插件 · keymap · widgets · DOM 事件          │    │
│   └──────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

| 层 | 职责 | 不该做的事 |
|----|------|-----------|
| **App Shell (Rust)** | 文件系统、vault 模型、窗口/菜单/更新 | 不实现 Markdown 语义 |
| **Renderer (React)** | UI、状态、面板、对话框 | 不直接拼 Markdown 决策逻辑 |
| **editor-core** | Markdown 语义解析 + 纯编辑命令 | 不 import 任何具体渲染器（`@codemirror/view`） |
| **editor/ (CM adapter)** | 输入、选区、decoration/widget 渲染、视口协调 | 不承载业务语义（应调用 editor-core） |

---

## 2. 已实现能力（v2.0 – v2.4）

- **Live Preview**：代码块、表格、frontmatter（Properties 面板）、行内格式（粗/斜/删除线/
  行内代码/链接）、wiki 链接、任务复选框、脚注 hover 预览。
- **富内容（v2.4）**：Mermaid / PlantUML / Graphviz 图表、KaTeX 行内/块级公式、图片拖拽粘贴 +
  尺寸控制 + 预览浮层、`<video>`/`<audio>` 嵌入、Callout、`==高亮==`。
- **文件管理**：Rust vault 递归扫描、文件树、右键菜单（新建/重命名/移动/回收站/复制路径/
  Finder）、隐藏目录配置、移动对话框、状态栏、日程（Daily Notes）。
- **窗口与会话**：多标签（per-tab draft & 冲突检测）、对等多窗口、跨窗口事件同步、多 vault、
  崩溃恢复草稿、Tauri updater、Cmd+K 全局搜索。

详尽版本清单见 [ROADMAP.md](ROADMAP.md) 的「已完成版本」。

---

## 3. editor-core — 平台无关编辑器内核

`src/renderer/src/editor-core/`。这是 ROADMAP P0.1 要求的边界：编辑器**语义**集中于此，与具体
渲染器/运行时解耦。约束：**禁止 import `@codemirror/view`**（由
[`test/editorCore-boundary.test.ts`](../test/editorCore-boundary.test.ts) 守护）。

```
editor-core/
├── index.ts              # 公共 barrel + 边界说明（唯一对外入口）
├── types.ts              # 契约：TextRange · EditDoc · TextChange · EditResult
├── projection.ts         # parse → render model（re-export 解析层）
└── commands/
    ├── inlineMark.ts      # toggleInlineMark — 粗/斜/删除线/行内代码/高亮（纯）
    ├── link.ts           # wrapLink — 选区包裹为 [t](url)（纯）
    ├── block.ts          # setHeading · toggleBlockquote/Bullet/Ordered/TaskList（纯）
    ├── lines.ts          # moveLines · duplicateLines（纯）
    ├── textLines.ts      # 内部行工具：selectedLines · rewriteLines（不对外）
    ├── checkbox.ts        # toggleTaskOnLine — 任务复选框（纯）
    ├── list.ts            # 列表延续/缩进（re-export 自 editor/listContinuation）
    └── table.ts           # 行/列增删 · 对齐 · 建表 · parse/serialize（纯）
```

完整命令矩阵见 [EDITOR-FEATURES.md](EDITOR-FEATURES.md) §9。

### 两个半区

1. **Projection（解析 → 渲染模型）** — `collectDecorations(state)` 遍历 Markdown/GFM/Obsidian
   语法树，输出**渲染器中立**的 `DecoSpec[]`（style / conceal / block widget / link 等）。
   `rangeRevealed` 是光标还原策略。任何渲染器（今天的 CM6、未来的 TextKit/WASM）都消费同一份
   spec 列表。
   > 注：`collectDecorations` 目前以 CM `EditorState` 为入参，因为它依赖 Lezer Markdown 树。
   > Lezer 是 parser 而非 view，是可接受的核心依赖；将输入收敛为 `{text, tree, selection}`
   > 列为 roadmap 后续项。

2. **Commands（纯文本变换）** — 以**偏移量**描述编辑（`EditResult { changes, selection }`），
   不 import CodeMirror。视图层把 `EditResult` 适配为一次 transaction。

### 命令契约（`types.ts`）

```ts
interface EditDoc    { text: string; selection: TextRange }   // 命令的最小输入
interface TextChange { from: number; to: number; insert: string }
interface EditResult { changes: TextChange[]; selection?: TextRange }
```

纯命令以 `EditDoc`（或更小的「单行文本」）为输入，便于无 DOM 单元测试——参见
`test/editorCore-*.test.ts`。

---

## 4. editor/ — CodeMirror 6 adapter

`src/renderer/src/editor/`。CM6 在此**只**负责输入、选区、decoration/widget 渲染与视口协调；
业务语义委托给 editor-core。

- `livePreview/livePreviewPlugin.ts` — `StateField`/`ViewPlugin`，把 `DecoSpec[]` 转成 CM
  `Decoration`/`WidgetType`。
- `livePreview/widgets.ts` — 各类 block/inline widget（代码块、表格、图表、公式、图片…）。
- `commands/applyEdit.ts` — 把 editor-core `EditResult` dispatch 成一次 transaction。
- `commands/inlineMarkKeymap.ts` — ⌘B/⌘I/⌘E/⌘⇧X/⌘⇧H → `toggleInlineMark`。
- `commands/blockKeymap.ts` — ⌘⌥1–6 标题、⌘⇧7/8/9 列表、⌘⇧. 引用、⌥↑/↓ 移动行、⇧⌥↓ 复制行。
- `listContinuation.ts` — Enter/Tab/Shift-Tab keymap（纯逻辑已被 editor-core re-export）。
- `slashTrigger.ts` — `/` 斜杠菜单触发（IME-safe）。
- `components/Editor.tsx` — 装配 EditorState/extensions，桥接 React（slash 菜单、图片预览、
  拖拽粘贴、链接打开）。

**Adapter 模式**：键盘命令读取 `view.state`，构造 `EditDoc`，调用 editor-core 纯命令，再用
`applyEditResult` 写回。新增编辑命令时，纯逻辑放 editor-core，键位绑定放 `editor/commands/`。

---

## 5. 状态与 IPC

- **Zustand stores**（`stores/`）：文档/标签状态、vault 状态、设置、主题。
- **IPC**（`lib/api.ts` ↔ `src-tauri/src/commands.rs`）：文件读写、vault 扫描、asset 导入、
  回收站、窗口管理；类型在 `src/shared`。
- **Watcher**：Rust `file_watcher.rs` 发事件 → 前端 `hooks/useVaultWatch` 合并刷新树/冲突检测。

---

## 6. 测试

Vitest（`test/`，67 个文件 / 391 用例）：node 环境跑纯逻辑，jsdom 环境跑 widget/DOM 行为。
editor-core 单元测试覆盖 inline mark、checkbox、table、公共 surface 与渲染器独立性边界。

```bash
pnpm test          # 全量
pnpm typecheck     # tsc node + web
```

---

## 7. 演进方向（摘要）

把核心能力从具体 UI/运行时持续剥离：editor-core（进行中）→ vault-core / file-tree-core →
command registry → 内部 plugin-api → 可选 Swift/TextKit 单文件原型。详见 [ROADMAP.md](ROADMAP.md)。
