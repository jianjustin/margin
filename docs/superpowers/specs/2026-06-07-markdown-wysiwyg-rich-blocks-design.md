# Markdown 所见即所得增强：富块渲染 + 属性面板

**日期**: 2026-06-07
**状态**: 已批准，待实施

## 背景

Margin 是一个 Typora 风格的 Obsidian vault 编辑器，编辑器基于 CodeMirror 6 的实时预览装饰层（`src/renderer/src/editor/livePreview/`）。当前实时预览通过遍历 markdown 语法树，发出装饰规格（`decorationSpecs.ts`），由 `livePreviewPlugin.ts` 转成 CodeMirror 装饰。已有 `CheckboxWidget`/`HrWidget` 块级 widget，以及 `rangeRevealed()` 光标揭示机制。

用户在使用中发现四个所见即所得问题，参照 Obsidian / Typora 体验改善：

1. **标题有下划线** — 不应该有。
2. **代码块过长**不支持横向滚动，且代码高亮不足。
3. **GFM 表格**完全没有渲染（显示为原始管道符文本）。
4. 缺少 **Obsidian 式属性面板**（frontmatter 可视化、可编辑）。

## 核心架构决策：统一「块级 Widget + 光标揭示」模式

代码块、表格、属性面板三者本质相同：**一块渲染态 UI，需与 markdown 源文本双向同步**。三者统一实现为：

- **块级 DOM widget**（`Decoration.replace({ block: true, widget })`），用原生 DOM 构建，**不在 CodeMirror 内嵌 React**（避免生命周期/协调复杂度，与现有 `CheckboxWidget`/`HrWidget` 一致）。
- **光标揭示**：光标在区域外 → 渲染态 widget；光标进入区域 → 揭示原始可编辑文本（复用 `rangeRevealed()`）。
- **双向同步**：widget 内编辑（输入框 / contenteditable）在 `compositionend` 或 `blur` 时提交，构建新的 markdown 文本并 `view.dispatch()` 回写源文档。**CodeMirror 始终是唯一数据源**。

这样不会双重渲染、随文档自然滚动、与现有架构完全一致。

### 中文输入法约束

用户使用中文输入。所有 widget 内的可编辑控件（`<input>`、`contenteditable`）**必须监听 `compositionstart`/`compositionend`**，组合输入期间不提交、不重建，避免打断输入法。原生 `<input>` 自身处理 IME，但提交时机要避开组合中状态。

### 焦点保持

widget 自身 dispatch 导致装饰重建时，`WidgetType.eq()` 必须在内容等价时返回 `true`，让 CodeMirror 复用既有 DOM、不重建、不丢焦点。提交策略以 `blur`/`compositionend` 为主，配合稳定的 `eq()`。

## 四项改动设计

### ① 标题下划线修复（自定义 HighlightStyle）

**问题根因**：`Editor.tsx` 使用 `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`，CodeMirror 默认高亮样式给 `tags.heading` 加了 `text-decoration: underline`。

**改动**：新建 `src/renderer/src/editor/livePreview/highlightStyle.ts`，用 `HighlightStyle.define([...])` 自定义样式：

- heading 标签：仅 `fontWeight`，**无下划线**（粗细其实已由 `theme.ts` 的 `.cm-h*` 控制，这里确保不加下划线）。
- 同时定义代码 token 配色（keyword / string / comment / number / function / variable 等），供代码块高亮复用，配色取自 `tokens.css` 的语义变量。

`Editor.tsx` 改为 `syntaxHighlighting(marginHighlightStyle)`。

**验收**：`# 标题` 渲染后无下划线；截图确认。

### ② 代码块：横向滚动 + 高亮（块级 widget）

**问题根因**：`Editor.tsx` 全局开启 `EditorView.lineWrapping`，代码行随之换行而非横向滚动；现有 fenced code 仅靠 `.cm-code-block` 加背景。

**改动**：新建 `CodeBlockWidget`（`widgets.ts`）。在 `decorationSpecs.ts` 中，对 `FencedCode` 节点（光标在外时）发出一个块级替换规格，携带语言（`CodeInfo`）与代码正文。

- widget 渲染 `<pre class="cm-code-render"><code>…</code></pre>`，`white-space: pre; overflow-x: auto`，底部出现横向滚动条。
- 高亮：用 `@codemirror/language` 的 `highlightCode` / `highlightTree` + `@codemirror/language-data` 按语言加载解析器产出高亮片段；解析器异步加载，未就绪时先渲染纯文本，加载完成后刷新（或同步对已加载语言高亮）。配色来自 ① 的 `marginHighlightStyle`。
- 顶部可显示语言标签（小字，右上角）。
- **光标进入 fence 区域**：不替换，揭示原始行（保持现有 `codeLine` 行装饰），此时编辑态。编辑态下行可能换行（可接受）；渲染态横向滚动。

**验收**：超长代码行在渲染态出现横向滚动条；关键字/字符串/注释有配色；光标进入可编辑。

### ③ GFM 表格：内联单元格编辑（块级 widget）

**前提**：lang-markdown 默认启用 GFM（strikethrough/task 已生效印证），语法树有 `Table`/`TableRow`/`TableCell`/`TableDelimiter` 节点。

**新建纯逻辑模块** `src/renderer/src/editor/livePreview/tableModel.ts`：

- `parseTable(source: string): TableModel` — 解析为 `{ header: string[], align: ('left'|'center'|'right'|null)[], rows: string[][] }`。对齐取自分隔行 `:---` / `:--:` / `---:`。
- `serializeTable(model: TableModel): string` — 回写为规范化 markdown 表格。
- 二者为纯函数，单测覆盖（往返、对齐、转义管道符 `\|`）。

**新建** `TableWidget`（`widgets.ts`）：

- 渲染 `<table class="cm-table-render">`，表头 + 数据行，单元格 `contenteditable`，按 `align` 设 `text-align`。
- 单元格 `compositionend`/`blur` 提交：读取所有单元格文本 → `serializeTable` → `view.dispatch()` 替换 `Table` 源区域。
- `eq()` 按序列化后的 markdown 比较，内容等价不重建。
- **光标进入表格区域**：揭示原始 markdown（用户可做增删行列等复杂编辑）。

`decorationSpecs.ts`：对 `Table` 节点（光标在外）发出块级替换规格，携带表格源文本。

**v1 范围**：单元格内容编辑 + 列对齐渲染。**增删行/列**作为后续增强（通过揭示原始 markdown 仍可手动完成）。

**验收**：表格渲染为带边框的 HTML 表；单元格可直接编辑并回写；列对齐正确；中文输入正常。

### ④ 属性面板：可编辑 frontmatter（块级 widget）

现状：frontmatter 仅按 `.cm-frontmatter` 渲染为灰色等宽文本（`decorationSpecs.ts` 的 `frontmatterEnd` + 逐行规格）。改为 Obsidian 式可编辑面板。

**新建纯逻辑模块** `src/renderer/src/editor/livePreview/frontmatterModel.ts`：

- `parseFrontmatter(source: string): FmField[]` — 用 `js-yaml` 解析 frontmatter 正文为有序键值；每个字段推断类型：
  - 数组 → `list`（标签式）
  - 布尔 → `checkbox`
  - 形如 `YYYY-MM-DD` 字符串 → `date`
  - 数字 → `number`
  - 其余 → `text`
- `serializeFrontmatter(fields: FmField[]): string` — 回写 `---\n…\n---`，用 `js-yaml` dump，保持键顺序。
- 纯函数，单测覆盖（类型推断、往返、列表、空值）。

**新建** `PropertiesWidget`（`widgets.ts`）：

- 渲染卡片：每行 `[键名 | 类型化控件]`。控件：list→标签输入、checkbox→复选框、date→日期输入、number→数字输入、text→文本输入。
- 底部「+ 添加属性」按钮：新增一行（默认 text 类型，可改键名）。
- 删除属性：每行悬停出现删除按钮。
- 编辑提交（`compositionend`/`blur`/`change`）→ `serializeFrontmatter` → dispatch 替换 frontmatter 区域。
- `eq()` 按序列化结果比较。

`decorationSpecs.ts`：frontmatter 区域（光标在外）发出**单个块级替换规格**（替换整个 `---…---`），不再逐行发 `frontmatter` 行装饰。光标进入区域时揭示原始 YAML。

将 `js-yaml` 从间接依赖提升为直接依赖（已在 `node_modules`），并加 `@types/js-yaml`（devDep）。

**验收**：含 frontmatter 的笔记顶部显示属性卡片；改值/加键/删键回写 YAML；类型控件正确；中文输入正常。

## 模块边界

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| `highlightStyle.ts` | 自定义高亮样式（标题无下划线 + 代码配色） | `@codemirror/language` |
| `tableModel.ts` | 表格 markdown ↔ 模型（纯函数） | 无 |
| `frontmatterModel.ts` | frontmatter YAML ↔ 字段（纯函数） | `js-yaml` |
| `widgets.ts` | `CodeBlockWidget` / `TableWidget` / `PropertiesWidget`（DOM + dispatch） | 上述 model + CM view |
| `decorationSpecs.ts` | 新增 table / 改造 code、frontmatter 的块级规格 | 现有 + 新 model |
| `livePreviewPlugin.ts` | 把新规格转成块级 widget 装饰 | widgets |

纯逻辑（model、highlight style）与 DOM/CM 副作用（widgets、specs）分离，便于单测。

## 测试策略

- **单元测试**（vitest + jsdom，沿用现有 `test/`）：`tableModel`（往返、对齐、转义）、`frontmatterModel`（类型推断、往返）、`decorationSpecs` 对 table/code/frontmatter 的规格产出。
- **视觉验证**：`npm run dev` 启动 Electron，截图真实窗口，逐项确认标题无下划线、代码横滚高亮、表格渲染、属性面板。准备一篇含全部元素的测试笔记。
- **回归**：`npm run typecheck && npm run test` 全绿。

## 实施分期（每期独立可验证）

- **Phase 1**：① 自定义 HighlightStyle（标题无下划线 + 代码配色）。最快可验证。
- **Phase 2**：② 代码块 widget（横滚 + 高亮）。
- **Phase 3**：③ 表格 model + widget（内联编辑）。
- **Phase 4**：④ frontmatter model + 属性面板 widget。

每期结束跑 typecheck/test + 截图验证后再进入下一期。

## 非目标（YAGNI）

- 表格增删行/列的按钮 UI（v1 通过揭示原始 markdown 完成）。
- 代码块语言切换 UI、复制按钮。
- 属性面板的关联笔记/标签自动补全、属性重排拖拽。
- frontmatter 原始 YAML 与面板的并排双视图。
