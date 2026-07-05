# Margin 重构与优化方案（编辑器手感 · UI 统一 · 分层 · 拖拽 · 插件化）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复编辑器四类交互 bug、建立统一 UI 原语层、把 App.tsx 业务逻辑下沉到内核/hooks、补齐文件树与编辑器拖拽、把日程/大纲重构为内置插件。

**Architecture:** 沿用 ARCHITECTURE.md 已声明的四内核边界（editor-core / vault-core / core-commands / plugin-api），本方案的主体工作是"让 UI 真正消费这些边界"：CM6 adapter 只留渲染与 IO；React 层新增 `components/ui/` 原语与 `hooks/` 业务编排层；拖拽与插件化建立在这两层之上。

**Tech Stack:** Tauri v2 + React 18 + Vite + Tailwind + Zustand + CodeMirror 6（Lezer markdown）+ Vitest（node/jsdom）。

## Global Constraints

- 原始 `.md` 文本始终是 source of truth，projection 不改变存储格式（ROADMAP P0 验收标准）。
- `editor-core` 禁止 import `@codemirror/view`（由 `test/editorCore-boundary.test.ts` 守护）。
- 全部颜色/圆角/阴影必须使用 `src/renderer/src/theme/tokens.css` 的 CSS 变量，禁止新增硬编码色值。
- 每个任务提交前必须通过 `pnpm test` 与 `pnpm typecheck`。
- 提交信息使用 conventional commits（`fix:` / `feat:` / `refactor:`），中文描述。

---

## 现状诊断（四路审计结论）

### 1. 编辑器交互 bug（机制级根因）

| Bug | 根因 | 位置 |
|-----|------|------|
| Todo 切换时机怪 | reveal 是**行级**判定（光标在行内任意列都还原整行源码），且 `revealSignature` 只含行号，同行列移动不重算 decoration | `reveal.ts:7-14`、`livePreviewPlugin.ts:231-238` |
| Todo 显示态丑 | revealed 时 checkbox widget 直接不生成（`if (!s.revealed)`），`- [ ]` 变裸文本无任何样式；checked 任务文本无完成态样式 | `livePreviewPlugin.ts:87-93`、`decorationSpecs.ts:360-380` |
| 图片切换怪 | 光标在图片行时 `return`，**不生成任何 spec**——裸源码是"缺 decoration 的副作用"而非受控状态 | `decorationSpecs.ts:384-411` |
| 光标上下跳跃 | 图片/媒体用 `Decoration.replace({block:true})` 替换整段文本，CM 将其视为原子块，↑/↓ 直接跳过该行；widget 却返回 inline `<span>`；全项目无 `atomicRanges` | `livePreviewPlugin.ts:128-155`，`widgets.ts:751-753` |

### 2. UI 不统一

Token 体系本身健康（48 个 oklch 变量，绝大多数组件在用）。问题是**缺一层共享原语**：

- 8 个浮层组件各自实现遮罩/容器/关闭逻辑：遮罩透明度 3 种（0.24/0.4/0.45）、圆角 7 种（`rounded-md/lg/xl/2xl/[10px]` 等）、阴影 10+ 种、Esc/点击外部关闭逻辑重复 8 份。
- 无 Button/Input 组件；`components.json` 配了 shadcn 但 `components/ui/` 不存在。
- 硬编码：`ConfirmDialog.tsx:61` 的 `bg-red-600`；`index.css:114` 与 `theme.ts:71` 的裸 oklch。
- lucide 图标 7 种尺寸（11–17）混用；focus 边框混用 `--accent-line` 与 `--accent`。

### 3. 分层/模块化

四个内核"框架就位、消费不足"：

- `App.tsx`（868 行）承担 11 类职责：保存队列状态机（272-345）、文件事务（417-482）、对话框状态机（404-830）、快捷键（179-204）、链接分发（237-261）等；35+ 处 `useXxxStore.getState()` 直调。
- FileTree 用 `lib/flattenTree` 而非 vault-core；MoveDialog 自实现树过滤（应使用 `filterTree`）；`renamePlan`/`movePlan` 已定义但**零调用**。
- 日程功能散落 4 处（lib/schedule.ts + OutlineDrawer + App + SettingsPanel）；大纲自实现 `parseHeadings`。
- plugin-api 仅 1 个示例插件；声明 6 种权限只实现 2 种检查；PluginMarket 是硬编码 4 条数据的静态壳。

### 4. 拖拽

- 文件树：**零拖拽代码**，移动全靠 MoveDialog；树是普通展平渲染（非虚拟列表，规模可控）。
- 编辑器：仅图片 drop/paste（`Editor.tsx:212-237`）；依赖的 `File.path` 是 Electron 遗留，Tauri v2 WKWebView 下不存在；未使用 Tauri `onDragDropEvent`（v2 默认拦截系统文件拖放，HTML5 `dataTransfer.files` 在 macOS 上不可靠）。
- Rust 侧能力齐备：`move_path`/`rename_path`/`import_asset_from_path`/`write_asset_bytes` 已注册。
- 移动/重命名后 wiki/相对链接**不会**自动更新（仅标签页路径更新）。

---

## 阶段总览与依赖

```
P1 编辑器交互修复        —— 独立，立即可做（最高优先级，直接影响手感）
P2 UI 原语层与统一       —— 独立，可与 P1 并行
P3 分层重构（App 拆解）   —— 独立，可与 P1/P2 并行；P2 完成后浮层迁移收益最大
P4 拖拽交互             —— 依赖 P3.3（useFileOperations）
P5 插件化（日程/大纲）    —— 依赖 P3.7（schedule/outline 逻辑收口到 core）
```

> 执行建议：P1 按下文 TDD 步骤直接执行；P2–P5 每期开工前，以本方案对应章节为 spec，
> 用 superpowers:writing-plans 展开成当期执行计划（本文件已给出文件清单、接口契约与关键代码）。

---

# P1 编辑器交互修复（详细执行计划）

## Task 1.1: 新增范围级 reveal 判定 `markerRevealed`

**Files:**
- Modify: `src/renderer/src/editor/livePreview/reveal.ts`
- Test: `test/reveal.test.ts`（追加用例）

**Interfaces:**
- Produces: `markerRevealed(state: EditorState, from: number, to: number, pad?: number): boolean`——仅当选区与 `[from-pad, to+pad]`（偏移级，默认 pad=1）相交时为 true。行级 `rangeRevealed` 保留给块级元素（图片行、hr、列表符）。

- [ ] **Step 1: 写失败测试**（追加到 `test/reveal.test.ts`，import 方式与该文件现有用例一致）

```ts
import { EditorState, EditorSelection } from '@codemirror/state'
import { markerRevealed } from '../src/renderer/src/editor/livePreview/reveal'

describe('markerRevealed', () => {
  const doc = '- [ ] buy milk'
  // marker "[ ]" 在偏移 2..5
  it('光标在 marker 内 → true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(3) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
  it('光标紧贴 marker 边缘（pad=1）→ true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(6) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
  it('光标在同一行行尾（远离 marker）→ false', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(14) })
    expect(markerRevealed(state, 2, 5)).toBe(false)
  })
  it('选区覆盖 marker → true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.range(0, 14) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run test/reveal.test.ts`，期望 "markerRevealed is not a function"

- [ ] **Step 3: 实现**（追加到 `reveal.ts`）

```ts
/**
 * True if any selection range touches [from-pad, to+pad] (offset-level).
 * Marker-grade reveal: only the syntax token the cursor is actually on/next to
 * flips to source — the rest of the line keeps its rendered form (Typora-style).
 */
export function markerRevealed(
  state: EditorState,
  from: number,
  to: number,
  pad = 1
): boolean {
  const lo = Math.max(0, from - pad)
  const hi = Math.min(state.doc.length, to + pad)
  for (const range of state.selection.ranges) {
    if (range.to >= lo && range.from <= hi) return true
  }
  return false
}
```

- [ ] **Step 4: 运行通过** — `pnpm vitest run test/reveal.test.ts`
- [ ] **Step 5: Commit** — `git commit -m "feat(editor): 新增偏移级 reveal 判定 markerRevealed"`

## Task 1.2: reveal 签名改为偏移级

**Files:**
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts:231-238`

**Interfaces:**
- Consumes: 无（内部函数）。
- 影响：selection 变化即重建 decoration（原先同一行内移动不重建——这正是 Todo/图片"切换时机怪"的直接原因之一）。`collectDecorations` 走 Lezer 增量树，中等文档重建开销可接受；若后续大文档实测卡顿，追加"viewport 内 inline decoration 走 ViewPlugin"的优化任务。

- [ ] **Step 1: 替换 `revealSignature` 实现**（行级签名 → 偏移签名），并同步更新函数上方注释：

```ts
/**
 * Fingerprint of the exact selection offsets. Marker-level reveal (see
 * `markerRevealed`) depends on cursor *columns*, not just lines, so any
 * selection change may flip a marker — rebuild whenever offsets change.
 * Identical-selection transactions (e.g. focus events) still skip rebuilds.
 */
function revealSignature(state: EditorState): string {
  let sig = ''
  for (const r of state.selection.ranges) {
    sig += r.from + '-' + r.to + ','
  }
  return sig
}
```

- [ ] **Step 2: 全量测试** — `pnpm test`，期望全部通过（该函数无直接测试，靠行为测试兜底）
- [ ] **Step 3: Commit** — `git commit -m "fix(editor): reveal 签名改为偏移级，列移动即时刷新编辑态"`

## Task 1.3: Todo 复选框 — marker 级切换 + 编辑态/完成态样式 + 重绘

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`（TaskMarker 分支 :359-380；`DecoKind` 增加 `'taskDoneText'`）
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`（task 分支 :87-93）
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`（CheckboxWidget :11-41）
- Modify: `src/renderer/src/editor/livePreview/theme.ts`（checkbox/完成态样式）
- Test: `test/decorationSpecs-task.test.ts`、`test/checkboxToggle-dom.test.ts`

**Interfaces:**
- Consumes: Task 1.1 的 `markerRevealed`。
- Produces: `DecoSpec` 新 kind `'taskDoneText'`（已完成任务的正文范围）；CheckboxWidget DOM 由 `<input>` 改为 `<span role="checkbox">`（测试选择器从 `input.cm-task-checkbox` 改为 `.cm-task-checkbox`）。

**行为定义（新）：**
1. 光标在任务行但不贴近 `- [ ]` → checkbox 保持渲染（不再整行还原源码）。
2. 光标触及 `- [ ]`（含 pad 1 字符）→ 显示源码，且源码带 `cm-task-src` 样式（等宽 + accent 色），不再是裸文本。
3. `[x]` 任务 → 正文加 `cm-task-done`（删除线 + 弱化色）。

- [ ] **Step 1: 更新 spec 测试**（`test/decorationSpecs-task.test.ts`，按新行为改写断言）

```ts
// 光标在行尾（远离 marker）：task spec 不 revealed
{
  const state = mkState('- [ ] buy milk', 14)
  const task = collectDecorations(state).find((s) => s.kind === 'task')
  expect(task?.revealed).toBe(false)
}
// 光标在 marker 内：revealed
{
  const state = mkState('- [ ] buy milk', 3)
  const task = collectDecorations(state).find((s) => s.kind === 'task')
  expect(task?.revealed).toBe(true)
}
// 已完成任务：正文带 taskDoneText spec
{
  const state = mkState('- [x] done item', 0)
  const done = collectDecorations(state).find((s) => s.kind === 'taskDoneText')
  expect(done).toBeTruthy()
  expect(done!.from).toBe(6) // "[x]" 之后的空格后
}
```
（`mkState` 使用该测试文件既有的 state 构造 helper。）

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run test/decorationSpecs-task.test.ts`

- [ ] **Step 3: 改 `decorationSpecs.ts`**

`DecoKind` 联合类型加 `| 'taskDoneText'`。TaskMarker 分支整体替换为：

```ts
// Task checkbox — marker-level reveal: only flips to source when the cursor
// actually touches "- [ ]"; elsewhere on the line the checkbox stays rendered.
if (name === 'TaskMarker') {
  const raw = doc.sliceString(node.from, node.to)
  let li: typeof node.node | null = node.node.parent
  while (li && li.name !== 'ListItem') li = li.parent
  const mark = li?.getChild('ListMark')
  const hideFrom = mark && mark.from < node.from ? mark.from : node.from
  const revealed = markerRevealed(state, hideFrom, node.to)
  if (mark && mark.from < node.from) {
    specs.push({ kind: 'hide', from: mark.from, to: node.from, revealed })
  }
  const checked = /\[[xX]\]/.test(raw)
  specs.push({ kind: 'task', from: node.from, to: node.to, revealed, checked })
  if (checked) {
    const line = doc.lineAt(node.from)
    if (node.to + 1 < line.to) {
      specs.push({ kind: 'taskDoneText', from: node.to + 1, to: line.to, revealed: false })
    }
  }
  return
}
```
（顶部 import 增加 `markerRevealed`。）

- [ ] **Step 4: 改 `livePreviewPlugin.ts`**

模块级常量区（`hideMark` 附近）追加：

```ts
const taskSrcMark = Decoration.mark({ class: 'cm-task-src' })
const taskDoneMark = Decoration.mark({ class: 'cm-task-done' })
```

`case 'task'` 与新 case 改为：

```ts
case 'task':
  if (!s.revealed) {
    ranges.push(
      Decoration.replace({ widget: new CheckboxWidget(s.checked ?? false, s.from, s.to) }).range(s.from, s.to)
    )
  } else {
    ranges.push(taskSrcMark.range(s.from, s.to))
  }
  break
case 'taskDoneText':
  ranges.push(taskDoneMark.range(s.from, s.to))
  break
```

- [ ] **Step 5: 重绘 CheckboxWidget**（`widgets.ts:11-41` 整体替换；`checkSvg` 放在现有 `baseSvg`/`path` helper 旁）

```ts
/** Renders a task-list checkbox replacing the raw `[ ]` / `[x]` token. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('span')
    box.className = 'cm-task-checkbox' + (this.checked ? ' cm-task-checkbox-on' : '')
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    if (this.checked) box.appendChild(checkSvg())
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return box
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

```ts
function checkSvg(): SVGSVGElement {
  const svg = baseSvg()
  svg.setAttribute('stroke-width', '3')
  svg.appendChild(path('M5 13l4 4L19 7'))
  return svg
}
```

- [ ] **Step 6: theme.ts 样式**（替换原 `input.cm-task-checkbox` 相关规则）

```ts
'.cm-task-checkbox': {
  display: 'inline-block',
  width: '15px',
  height: '15px',
  borderRadius: '4px',
  border: '1.5px solid var(--checkbox-border)',
  background: 'var(--bg-elev)',
  verticalAlign: 'text-bottom',
  cursor: 'pointer',
  marginRight: '6px',
  transition: 'background 0.12s ease, border-color 0.12s ease'
},
'.cm-task-checkbox:hover': { borderColor: 'var(--accent)' },
'.cm-task-checkbox-on': {
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
  color: 'var(--accent-ink)'
},
'.cm-task-checkbox-on svg': { width: '11px', height: '11px', display: 'block', margin: '1px auto' },
'.cm-task-src': { fontFamily: 'var(--mono)', fontSize: '0.9em', color: 'var(--accent)' },
'.cm-task-done': {
  textDecoration: 'line-through',
  textDecorationColor: 'var(--text-faint)',
  color: 'var(--text-faint)'
}
```

- [ ] **Step 7: 更新 DOM 测试** — `test/checkboxToggle-dom.test.ts` 中的选择器 `input.cm-task-checkbox` → `.cm-task-checkbox`，断言 toggle 行为不变（mousedown 后文档 `[ ]` ↔ `[x]`）。
- [ ] **Step 8: 全量测试** — `pnpm test`，期望通过
- [ ] **Step 9: Commit** — `git commit -m "fix(editor): Todo 复选框 marker 级切换、编辑/完成态样式重绘"`

## Task 1.4: 图片/媒体 — 独行不再整块替换，编辑态保留预览

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`（Image 分支 :382-411；`DecoSpec` 增加 `placement?: 'block' | 'inline'`）
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`（image/media 分支 :128-155）
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`（新增 `ImageBlockWidget`/`MediaBlockWidget`）
- Modify: `src/renderer/src/editor/livePreview/theme.ts`
- Test: `test/decorationSpecs-image.test.ts`、`test/livePreview-dom.test.ts`

**Interfaces:**
- Produces: `DecoSpec.placement`；`ImageBlockWidget extends ImageWidget`、`MediaBlockWidget extends MediaWidget`（toDOM 外包 `div.cm-image-block` / `div.cm-media-block`）。

**行为定义（新）：**
1. **独行图片**（`![alt](url)` 占满一行）：预览用 `Decoration.widget({block:true, side:1})` 挂在**行尾之后**，源码文本仅被 inline `Decoration.replace({})` 隐藏——源码行始终存在且可落光标，↑/↓ 不再跳行。
2. 光标进入该行 → 源码显示（带 `cm-image-src` 样式），**图片预览保持在下方**（Typora 行为，不再"闪没"）。
3. **行内图片**：inline replace（不带 `block`），revealed 时显示带样式源码。
4. 点击图片预览 → 光标落到源码行，直接进入编辑态。
5. media（video/audio）同构处理。

- [ ] **Step 1: 更新 spec 测试**（`test/decorationSpecs-image.test.ts`）

```ts
// 独行图片、光标在别处：block placement、不 revealed
{
  const state = mkState('para\n\n![a](pic.png)\n', 0)
  const img = collectDecorations(state).find((s) => s.kind === 'image')
  expect(img).toMatchObject({ placement: 'block', revealed: false })
}
// 光标进入图片行：spec 仍存在且 revealed（旧实现是直接不生成 spec）
{
  const state = mkState('![a](pic.png)', 3)
  const img = collectDecorations(state).find((s) => s.kind === 'image')
  expect(img).toMatchObject({ placement: 'block', revealed: true })
}
// 行内图片：inline placement
{
  const state = mkState('before ![a](pic.png) after', 0)
  const img = collectDecorations(state).find((s) => s.kind === 'image')
  expect(img?.placement).toBe('inline')
}
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run test/decorationSpecs-image.test.ts`

- [ ] **Step 3: 改 `decorationSpecs.ts`** — `DecoSpec` 加字段 `placement?: 'block' | 'inline'`；Image 分支整体替换：

```ts
// Inline image / media. `placement` decides the rendering strategy:
// a standalone image gets a block widget BELOW its (concealed) source line,
// an in-text image is replaced inline. Spec is emitted in both reveal states
// so the widget can persist while the source is being edited.
if (name === 'Image') {
  const urlNode = node.node.getChild('URL')
  const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
  let alt = ''
  let firstMark: { to: number } | null = null
  for (let c = node.node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') {
      if (!firstMark) { firstMark = c; continue }
      alt = doc.sliceString(firstMark.to, c.from)
      break
    }
  }
  const meta = parseImageMeta(alt, url)
  const line = doc.lineAt(node.from)
  const standalone = line.text.trim() === doc.sliceString(node.from, node.to)
  specs.push({
    kind: meta.mediaKind ? 'media' : 'image',
    from: node.from,
    to: node.to,
    revealed: rangeRevealed(state, node.from, node.to),
    placement: standalone ? 'block' : 'inline',
    source: meta.url,
    info: meta.alt,
    title: meta.alt,
    width: meta.width,
    height: meta.height
  })
  return false // widget/mark handles the range — skip children
}
```

- [ ] **Step 4: 改 `livePreviewPlugin.ts`** — 常量区加 `const imageSrcMark = Decoration.mark({ class: 'cm-image-src' })`；image 分支替换（media 分支同构，用 `MediaBlockWidget`/`MediaWidget`、类名 `cm-media-block`）：

```ts
case 'image': {
  const src = s.source ?? ''
  const dp = state.facet(docPathFacet)
  const root = state.facet(vaultRootFacet)
  const cfg = state.facet(richContentConfigFacet)
  const resolved = isExternal(src) ? src : resolveMarkdownAsset(src, dp, root, cfg.assetsDir)
  if (s.placement === 'block') {
    // Preview lives BELOW the line as a side widget — the source line itself
    // is never block-replaced, so vertical cursor motion can land on it.
    ranges.push(
      Decoration.widget({
        widget: new ImageBlockWidget(src, s.info ?? '', resolved, s.width, s.height),
        block: true,
        side: 1
      }).range(state.doc.lineAt(s.to).to)
    )
    if (!s.revealed) {
      ranges.push(hideMark.range(s.from, s.to))
    } else {
      ranges.push(imageSrcMark.range(s.from, s.to))
    }
  } else if (!s.revealed) {
    ranges.push(
      Decoration.replace({
        widget: new ImageWidget(src, s.info ?? '', resolved, s.width, s.height)
      }).range(s.from, s.to)
    )
  } else {
    ranges.push(imageSrcMark.range(s.from, s.to))
  }
  break
}
```

- [ ] **Step 5: widgets.ts 新增 block 包装**（放在 ImageWidget / MediaWidget 定义之后）

```ts
/** Standalone-line image: block presentation below the (concealed) source line. */
export class ImageBlockWidget extends ImageWidget {
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-image-block'
    wrap.appendChild(super.toDOM(view))
    wrap.addEventListener('mousedown', (e) => {
      if (e.metaKey || e.ctrlKey) return // Cmd+click keeps the preview-overlay behavior
      e.preventDefault()
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } })
      view.focus()
    })
    return wrap
  }
}

export class MediaBlockWidget extends MediaWidget {
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-media-block'
    wrap.appendChild(super.toDOM(view))
    return wrap
  }
}
```
（`livePreviewPlugin.ts` 顶部 import 补 `ImageBlockWidget, MediaBlockWidget`。）

- [ ] **Step 6: theme.ts 样式**

```ts
'.cm-image-block': { padding: '2px 0', cursor: 'default' },
'.cm-media-block': { padding: '2px 0' },
'.cm-image-src': { fontFamily: 'var(--mono)', fontSize: '0.85em', color: 'var(--text-dim)' }
```

- [ ] **Step 7: DOM 回归**（`test/livePreview-dom.test.ts` 追加）：独行图片文档中，构建后的 decoration 集合**不存在**覆盖整行的 block 型 replace（遍历 `state.field(livePreview).deco`，对 spec 为 replace 且 `block` 的项断言其范围不含图片行）；存在挂在行尾的 block widget。
- [ ] **Step 8: 全量测试 + 手动**：`pnpm test`；`pnpm demo` 中验证 ↑/↓ 经过图片行不跳行、进入行时源码与预览同时可见。
- [ ] **Step 9: Commit** — `git commit -m "fix(editor): 图片/媒体改为行下侧挂 widget，修复光标跳行与编辑态闪失"`

## Task 1.5: atomicRanges — 光标不再卡在被隐藏语法内

**Files:**
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Modify: `src/renderer/src/components/Editor.tsx`（extensions 数组注册）
- Test: `test/livePreview-dom.test.ts`（追加）

**Interfaces:**
- Produces: `export const livePreviewAtomicRanges`（`EditorView.atomicRanges` extension）；`LivePreviewValue` 增加 `atomic: DecorationSet`。

- [ ] **Step 1: buildDecorations 同步收集原子范围** — 函数内加 `const atomic: Range<Decoration>[] = []`；**所有 inline `Decoration.replace`**（hide、hr、task widget、footnoteRef、wikiLink、mathInline、listBullet、listNumber、行内 image/media、独行图片的 hideMark）在 push 进 `ranges` 的同时 push 一份进 `atomic`。返回值改为：

```ts
return {
  deco: Decoration.set(ranges, true),
  atomic: Decoration.set(atomic, true)
}
```

`LivePreviewValue` 与 `create`/`update` 相应携带 `atomic`；文件末尾导出：

```ts
export const livePreviewAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.state.field(livePreview).atomic
)
```

- [ ] **Step 2: Editor.tsx 注册** — extensions 数组中 `livePreview` 旁加入 `livePreviewAtomicRanges`。
- [ ] **Step 3: 测试** — 追加断言：含 `**bold**` 与任务行的文档，`state.field(livePreview).atomic.size > 0`；`cursorCharRight` 跨过隐藏的 `**` 时 selection 一步越过（不停在隐藏区内部）。
- [ ] **Step 4: 全量测试** — `pnpm test`
- [ ] **Step 5: Commit** — `git commit -m "fix(editor): 注册 atomicRanges，光标横向移动越过隐藏语法"`

## Task 1.6: 行为冻结与手动验收

- [ ] `pnpm test && pnpm typecheck` 全绿。
- [ ] `pnpm demo` 手动清单：① Todo 行内左右移动光标，checkbox 仅在贴近 `- [ ]` 时展开；② 勾选态删除线；③ ↑/↓ 穿越 独行图片/视频/公式/表格，光标可落在图片源码行且不跳；④ 图片行编辑 URL 时预览仍显示在下方；⑤ 行内图片 reveal/复原正常；⑥ 大文档（≥2000 行）连续按 ↓ 无可感知卡顿（若卡顿，立项"inline decoration 迁移 ViewPlugin/viewport"跟进任务）。
- [ ] 更新 `docs/EDITOR-FEATURES.md` 中 task/image 的行为描述。
- [ ] Commit — `git commit -m "docs: 更新任务/图片 live preview 行为说明"`

---

# P2 UI 统一（任务分解 + 关键代码）

## Task 2.1: 补充设计 token

**Files:** Modify: `src/renderer/src/theme/tokens.css`

`:root` 追加（dark 主题在 `[data-theme='dark']` 中覆盖阴影为更深值）：

```css
--overlay: oklch(0 0 0 / 0.4);
--shadow-modal: 0 24px 64px oklch(0 0 0 / 0.5);
--shadow-popover: 0 18px 48px oklch(0 0 0 / 0.45);
--shadow-dropdown: 0 16px 36px oklch(0 0 0 / 0.14);
--radius-modal: 12px;
--radius-popover: 10px;
--radius-control: 8px;
--mark-highlight: oklch(0.89 0.12 92 / 0.62); /* 收编 index.css:114 的硬编码 */
```

步骤：加 token → `index.css:114` 与 `theme.ts:71` 的裸 oklch 改引用 token → `pnpm test` → commit `refactor(ui): 浮层/高亮 token 化`。

## Task 2.2: `useDismissable` — 统一 Esc/点击外部关闭

**Files:** Create: `src/renderer/src/hooks/useDismissable.ts`；Test: `test/useDismissable.test.tsx`

```ts
import { useEffect, type RefObject } from 'react'

/** Esc + (optional) outside-click dismissal, shared by all overlays. */
export function useDismissable(
  onClose: () => void,
  outsideOf?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent): void => {
      const el = outsideOf?.current
      if (el && !el.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    if (outsideOf) window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (outsideOf) window.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose, outsideOf])
}
```

测试：jsdom 渲染挂载 hook 的组件，`fireEvent.keyDown(window, { key: 'Escape' })` 触发 onClose；外部 mousedown 触发；内部 mousedown 不触发。

## Task 2.3: `components/ui/` 原语层

**Files:**
- Create: `src/renderer/src/components/ui/Button.tsx`、`Input.tsx`、`Modal.tsx`、`Popover.tsx`、`icon.ts`
- Test: `test/ui-button.test.tsx`、`test/ui-modal.test.tsx`

关键契约（`Button.tsx`，CVA；其余组件同风格）：

```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] text-[13px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--accent-line)]',
  {
    variants: {
      variant: {
        primary: 'bg-[color:var(--accent)] text-[color:var(--accent-ink)] hover:opacity-90',
        ghost: 'text-[color:var(--text)] hover:bg-[color:var(--bg-hover)]',
        danger: 'bg-[color:var(--red)] text-[color:var(--accent-ink)] hover:opacity-90'
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3'
      }
    },
    defaultVariants: { variant: 'ghost', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps): JSX.Element {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
```

`Modal.tsx` 契约：`{ open, onClose, width?, children }`——遮罩 `bg-[color:var(--overlay)]`、容器 `rounded-[var(--radius-modal)] shadow-[var(--shadow-modal)] border-[color:var(--border)] bg-[color:var(--bg-panel)]`、内部调用 `useDismissable`、点击遮罩关闭、`stopPropagation` 由 Modal 统一处理。
`Popover.tsx` 契约：`{ anchor: {x,y} | RefObject, onClose, children }`——`rounded-[var(--radius-popover)] shadow-[var(--shadow-popover)]`，`useDismissable(onClose, rootRef)`，统一入场动画（复用现有 `slash-in` keyframes，改名 `pop-in` 移入 index.css）。
`Input.tsx`：统一 `focus:border-[color:var(--accent-line)]`。
`icon.ts`：`export const ICON_SM = 14; export const ICON_MD = 16;`——图标尺寸只允许这两档（列表行内 14、独立按钮 16）。

## Task 2.4: 对话框迁移

**Files:** Modify: `ConfirmDialog.tsx`、`InputDialog.tsx`、`MoveDialog.tsx`

- 三者容器替换为 `<Modal>`；按钮替换为 `<Button variant="ghost|primary|danger">`（**顺带消灭 `ConfirmDialog.tsx:61` 的 `bg-red-600`**）；输入框替换为 `<Input>`（**统一 `MoveDialog.tsx:152` 的 focus token**）。
- 现有 DOM 测试（`moveDialog-collapse.test.tsx` 等）选择器如有依赖容器类名需同步更新。
- 每个组件一次 commit：`refactor(ui): XxxDialog 迁移 Modal/Button/Input 原语`。

## Task 2.5: 浮层迁移

**Files:** Modify: `SearchOverlay.tsx`、`SettingsPanel.tsx`、`SlashMenu.tsx`、`CalendarPopover.tsx`、`RowContextMenu.tsx`

- SearchOverlay/SettingsPanel → `<Modal>`（遮罩统一 `--overlay`；SettingsPanel 圆角从 `rounded-2xl` 归一到 `--radius-modal`，阴影从 0.18 归一到 `--shadow-modal`，下拉用 `--shadow-dropdown`）。
- SlashMenu/CalendarPopover/RowContextMenu → `<Popover>`（删除各自的 click-outside useEffect，统一入场动画与 `--radius-popover`）。
- 图标尺寸按 `icon.ts` 两档归一（11/12/13/15/17 全部收敛）。

## Task 2.6: 编辑器主题与字体收尾

**Files:** Modify: `theme.ts`、`tokens.css`、`index.css`

- `theme.ts` 中非标准 fontWeight（'610'/'620'/'635'/'650' 等）归一到 400/500/600（IBM Plex 静态字重，非可变字体，中间值实际无效或由浏览器伪造）。
- `--editor` 字体栈与 `--ui` 对齐：`'IBM Plex Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif`（Latin 一致用 Plex；若刻意要系统字体的正文观感，改为在 SettingsPanel 提供字体选项——默认仍对齐）。
- 验收：`grep -rn 'bg-red-\|#[0-9a-fA-F]\{6\}\|oklch(' src/renderer/src/components --include='*.tsx'` 无新增硬编码（`icons/` 内 token 引用除外）。

---

# P3 分层重构（任务分解 + 接口契约）

## Task 3.0: 原语层补课（P2 终审产出，2026-07-05 追加）

P2 签收时挂账的原语层完善项，开工 P3 时先做或与 3.1 并行：
- Popover：视口防溢出（clamp/翻转，惠及 SlashMenu/RowContextMenu）+ forwardRef 暴露内层 ref（修复 RowContextMenu 菜单内右键误关的迁移回归）。
- Modal/Popover 无障碍：`role="dialog"`/`aria-modal`、焦点陷阱、关闭后焦点归还。
- Esc 栈式分层：挂载序 LIFO 注册表，后开先关（useDismissable 现状为多浮层同关，JSDoc 已声明限制）。
- SettingsPanel FolderPicker 收编 `useDismissable` + `--radius-popover`（消灭第 9 份手写 click-outside）。
- 清理：删除 index.css 的 `slash-in` 死 keyframes；CalendarPopover 零调用方——接入 OutlineDrawer 或删除；PluginMarket 容器收敛到 Modal 原语。
- Modal `width` 改为 `min(width, calc(100vw - 32px))` 钳制。
- 图标尺寸全局归一（DocumentTabs/FileTreeRow/Sidebar/OutlineDrawer/UpdateSection/BacklinksPanel 仍有 11/12/13/15 残留）；`--shadow-sm` 与图片预览阴影 token 在出现第二处用例时一并抽取。

## Task 3.1: `stores/uiStore.ts` — UI 布局状态收口

**Files:** Create: `src/renderer/src/stores/uiStore.ts`；Test: `test/uiStore.test.ts`；Modify: `App.tsx:97-105`

```ts
import { create } from 'zustand'
import type { TreeNode } from '@/vault-core'

export type DialogState =
  | { kind: 'newNote'; dir: string }
  | { kind: 'newFolder'; dir: string }
  | { kind: 'rename'; node: TreeNode }
  | { kind: 'trash'; node: TreeNode }
  | null

interface UiState {
  sidebarOpen: boolean
  drawerOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  leftPaneWidth: number
  rightPaneWidth: number
  dialog: DialogState
  menu: { x: number; y: number; node: TreeNode } | null
  moveTarget: TreeNode | null
  toggleSidebar: () => void
  toggleDrawer: () => void
  setSettingsOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  setPaneWidths: (left?: number, right?: number) => void
  openDialog: (d: DialogState) => void
  closeDialog: () => void
  openMenu: (m: UiState['menu']) => void
  closeMenu: () => void
  setMoveTarget: (n: TreeNode | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  /* 初始值与 App.tsx 现值一致；actions 为直白 set 封装 */
  ...
}))
```
（`...` 处为逐字段实现，执行时按 App.tsx:97-105 的现有初始值填写——字段与 action 名以上述接口为准。）

## Task 3.2: `hooks/useSavePipeline.ts` — 保存队列状态机

**Files:** Create: `src/renderer/src/hooks/useSavePipeline.ts`；Test: `test/useSavePipeline.test.tsx`；Modify: `App.tsx:272-345`（整段迁出）

**Interfaces（Produces）：**

```ts
export interface SavePipeline {
  scheduleSave(path: string): void            // 800ms 防抖
  flushSaves(): Promise<void>                 // ⌘S / 关闭前
  pauseForPaths(paths: string[]): void        // 路径变异前暂停受影响保存
  resumeAfterMutation(oldPath: string, newPath: string | null): void
  waitForDocumentSaves(paths: string[]): Promise<void>
}
export function useSavePipeline(): SavePipeline
```

迁移即重构：逻辑照搬 App.tsx:272-345（含 `pausePendingSaveIfAffected`/`restorePausedAndBlockedSave`），以 `saveDocument.ts` 为唯一落盘出口。测试用 fake timers 覆盖：防抖合并、pause 后不落盘、resume 换路径落盘。

## Task 3.3: `hooks/useFileOperations.ts` — 文件事务收口（P4 拖拽的前置）

**Files:** Create: `src/renderer/src/hooks/useFileOperations.ts`；Test: `test/useFileOperations.test.tsx`；Modify: `App.tsx:210-261, 417-508`（迁出）

**Interfaces（Produces，P4/P5 直接消费）：**

```ts
export interface FileOperations {
  openFileByPath(path: string): Promise<void>
  openLink(target: string): Promise<void>            // wiki / 相对路径 / 外链三路分发
  renameNode(node: TreeNode, newName: string): Promise<void>
  moveNode(path: string, destDir: string): Promise<void>   // 供 MoveDialog 与拖拽共用
  trashNode(node: TreeNode): Promise<void>
  createNote(dir: string, name: string): Promise<string>
  createFolder(dir: string, name: string): Promise<void>
  openScheduleNote(date: Date): Promise<void>
}
export function useFileOperations(pipeline: SavePipeline): FileOperations
```

要求：
- `renameNode`/`moveNode` 内部改用 vault-core 的 `renamePlan`/`movePlan` 生成 `PathPlan`（消灭"已定义零调用"）；
- 事务顺序保持现状：pause 保存 → 等待落盘 → IPC → 标签更新 → `EV_PATH_MUTATED` → 清草稿 → 刷树；
- `moveNode` 前置校验调用 Task 4.1 的 `canMoveInto`（P4 完成前先做同目录/自身两条守卫）。

## Task 3.4: `hooks/useGlobalKeymap.ts`

App.tsx:179-204 的 5 个快捷键（⌘B/⌘\/⌘,/⌘K/⌘⇧N）迁出为 hook，动作全部改为调用 `core/commands` 注册表（`CommandRegistry.run(id)`），为后续 ⌘P 命令面板铺路。

## Task 3.5: App.tsx 收缩为装配层

- 上述四个任务合入后，App.tsx 只剩：布局 JSX、hooks 装配、对话框渲染分发（读 `uiStore.dialog`）。
- 验收：**App.tsx ≤ 250 行；`\.getState()` 在 components/ 下出现次数 ≤ 5**（事件桥/非 React 上下文豁免）。
- 回归：`test/app-rerender.test.tsx` 通过；手动过一遍新建/重命名/移动/删除/多窗口同步。

## Task 3.6: vault-core 消费收口

- `lib/flattenTree.ts` 实现移入 `vault-core/fileTree.ts`（若与现有 `flattenTree` 重复则合并签名），`lib/flattenTree.ts` 改为 `export { flattenTree } from '@/vault-core'` 的兼容 shim，FileTree.tsx 改为从 `@/vault-core` import。
- MoveDialog 的 `matchingPaths()`（MoveDialog.tsx:20-34）删除，改用 vault-core `filterTree`。
- 验收 grep：`components/` 下不再 import `lib/flattenTree`。

## Task 3.7: 大纲与日程逻辑收口（P5 前置）

- Create: `src/renderer/src/editor-core/outline.ts`：

```ts
export interface OutlineItem { level: 1 | 2 | 3; text: string; line: number }
export function collectOutline(text: string): OutlineItem[]
```
实现迁自 `OutlineDrawer.tsx:13-39` 的 `parseHeadings`（经 barrel `editor-core/index.ts` 导出，纯函数 + 测试 `test/editorCore-outline.test.ts`）。
- Create: `src/renderer/src/core/schedule/index.ts`：`lib/schedule.ts` 全量迁入（`formatDateKey`/`collectScheduleDates`/模板生成），`lib/schedule.ts` 留兼容 re-export；App 的 `openSchedule` 编排已在 Task 3.3 收入 `openScheduleNote`。

---

# P4 拖拽交互（任务分解 + 关键代码）

## Task 4.1: vault-core 移动守卫

**Files:** Modify: `src/renderer/src/vault-core/path.ts`；Test: `test/vaultCore-path.test.ts`（追加）

```ts
/** True if `child` is `parent` itself or nested anywhere under it. */
export function isSelfOrDescendant(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/')
}

/** Guard for drag-move: reject no-op, self, descendant and unsafe targets. */
export function canMoveInto(srcPath: string, destDir: string): boolean {
  if (!isPathSafe(srcPath) || !isPathSafe(destDir)) return false
  if (isSelfOrDescendant(srcPath, destDir)) return false
  return dirname(srcPath) !== destDir
}
```
测试：移动到自身/子孙/原目录/`.obsidian` → false；正常目标 → true。

## Task 4.2: 文件树拖动移动

**Files:** Modify: `FileTreeRow.tsx`、`FileTree.tsx`；Test: `test/fileTree-dnd.test.tsx`

- FileTreeRow 根 div 增加：

```tsx
draggable
onDragStart={(e) => {
  e.dataTransfer.setData('application/x-margin-path', node.path)
  e.dataTransfer.effectAllowed = 'move'
}}
onDragOver={(e) => {
  if (!isDir && !isRootDrop) return
  const src = e.dataTransfer.types.includes('application/x-margin-path')
  if (!src) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  setDropTarget(node.path)          // 目录行高亮（class: bg-[color:var(--accent-soft)]）
}}
onDragLeave={() => setDropTarget(null)}
onDrop={(e) => {
  e.preventDefault()
  setDropTarget(null)
  const src = e.dataTransfer.getData('application/x-margin-path')
  const destDir = isDir ? node.path : dirname(node.path)
  if (src && canMoveInto(src, destDir)) void fileOps.moveNode(src, destDir)
}}
```
- FileTree 容器接受 drop 到 vault 根；折叠目录 dragover 悬停 600ms 自动展开（`setTimeout` + dragleave 清除）；`dropTarget` 状态放在 FileTree 内经 props 下发。
- 测试（jsdom）：构造 DataTransfer mock，drop 到目录行断言 `moveNode(src, dest)` 被调；drop 到自身子孙断言未调用。

## Task 4.3: 文件树 → 编辑器拖入（插入链接/图片）

**Files:** Modify: `components/Editor.tsx`（drop handler 扩展）；Create: `src/renderer/src/lib/insertDropText.ts`（纯函数）+ Test

```ts
import { isImagePath } from '@/lib/fileKinds'   // 若无此谓词则在 fileKinds.ts 补充扩展名判断

/** Markdown text to insert when a vault path is dropped into the editor. */
export function insertTextForVaultPath(relPath: string): string {
  const name = relPath.split('/').pop()!.replace(/\.md$/i, '')
  if (isImagePath(relPath)) return `![${name}](${relPath})`
  if (/\.md$/i.test(relPath)) return `[[${name}]]`
  return `[${name}](${relPath})`
}
```
Editor drop handler 在现有图片分支前追加：读 `application/x-margin-path` → 计算 vault 相对路径（`path.startsWith(vaultRoot)` 时截断）→ `view.posAtCoords({x: e.clientX, y: e.clientY})` 定位插入点 → dispatch 插入 `insertTextForVaultPath(rel)`。

## Task 4.4: 系统文件拖入走 Tauri 事件（修复 Tauri v2 下的失效路径）

**Files:** Create: `src/renderer/src/hooks/useTauriFileDrop.ts`；Modify: `components/Editor.tsx`

背景：Tauri v2 默认拦截窗口级文件拖放，WKWebView 中 HTML5 `dataTransfer.files` 与 `File.path`（Electron 遗留）不可靠。改为：

```ts
import { getCurrentWebview } from '@tauri-apps/api/webview'

/** Native file drops (absolute paths) routed to the editor via Tauri events. */
export function useTauriFileDrop(
  onDropPaths: (paths: string[], position: { x: number; y: number }) => void
): void {
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        onDropPaths(event.payload.paths, event.payload.position)
      }
    })
    return () => { void un.then((f) => f()) }
  }, [onDropPaths])
}
```
Editor 侧 `onDropPaths`：命中编辑器区域（`view.dom.getBoundingClientRect()` 包含 position）时——图片/媒体扩展名 → `api.importAssetFromPath(root, path, assetsDir)` 后插入 `![...]`；`.md`/其他 → 插入链接。现有 HTML5 drop/paste 分支保留（demo/web 环境回退）。手动验收：从 Finder 拖 png/mp4/md 到编辑器。

## Task 4.5（后续独立方案，本期不做）: 移动/重命名后的链接重写

扫描 vault 内引用被移动路径的 wiki/相对链接并改写。涉及全库扫描、冲突与撤销策略，风险高、独立成篇；本期仅在 moveNode 完成后 toast 提示"引用未自动更新"。

---

# P5 插件化（任务分解 + 接口契约）

## Task 5.1: 贡献点与权限补齐

**Files:** Modify: `plugin-api/types.ts`、`plugin-api/host.ts`；Test: `test/pluginHost.test.ts`（追加）

- `PluginContext` 新增贡献点：

```ts
ui: {
  registerSidebarPanel(panel: {
    id: string
    title: string
    icon: string                        // lucide 图标名
    render(container: HTMLElement): () => void   // 返回 dispose
  }): Disposable
  registerStatusItem(item: { id: string; render(): string }): Disposable
}
```
- 权限门禁补全：声明的每种 permission（`commands` / `vault.read` / `ui.sidebar` / `ui.status` …以 types.ts 实际枚举为准）都有检查；未声明即用 → 抛错（已有测试模式照抄）。宣而未实现的权限（如 `network`）从枚举中删除，宁缺毋滥。

## Task 5.2: schedule 内置插件

**Files:** Create: `plugin-api/builtins/schedulePlugin.ts`；Modify: `OutlineDrawer.tsx`（Schedule tab 改由插件面板渲染）、`SettingsPanel.tsx`（不变，仍管配置）

- 纯逻辑消费 Task 3.7 的 `core/schedule`；注册命令 `schedule.openToday`（走 CommandRegistry，可绑快捷键/slash）与 sidebar panel（日历 UI）。
- 验收：关闭插件后日程入口消失且无报错；`test/pluginHost.test.ts` 覆盖激活/停用/dispose。

## Task 5.3: outline 内置插件

同构：`plugin-api/builtins/outlinePlugin.ts` 消费 `editor-core/outline.collectOutline`，注册 sidebar panel；OutlineDrawer 的 Outline tab 改由面板渲染。

## Task 5.4: PluginMarket 接真实注册表

**Files:** Modify: `PluginMarket.tsx`、`stores/settingsStore.ts`

- 删除硬编码 `PLUGINS` 数组；列表来自 `PluginHost.list()`（内置插件元数据：id/名称/描述/权限）；启用/禁用调用 host.activate/deactivate，状态持久化到 settingsStore（`enabledPlugins: string[]`）。
- 第三方插件安装**不在本期**——市场先只管理内置插件的开关与权限展示。

---

## 风险与回退

| 风险 | 缓解 |
|------|------|
| P1.2 偏移签名导致每次光标移动全量重建 decoration | Lezer 增量树 + 中等文档实测；1.6 有大文档手动验收项，卡顿则立项 viewport 化 |
| P1.4 改变图片渲染结构，富内容回归面大 | 先跑冻结的 `decorationSpecs-image`/`richContent*` 测试再动手；分支独立、单任务单 commit 可 revert |
| P3.5 App.tsx 大迁移引入行为回退 | 每个 hook 单独任务单独 commit；`app-rerender`/多窗口手动清单必过 |
| P4.4 Tauri drag-drop API 平台差异 | macOS 为主平台先行验证；HTML5 分支保留为回退 |

## 自审记录（writing-plans Self-Review）

- 覆盖检查：用户四项诉求 → P3+P5（分层/插件）、P2（UI 统一）、P4（拖拽）、P1（四个编辑器 bug 逐一对应 Task 1.2–1.5）。✓
- 类型一致性：`markerRevealed`（1.1 定义，1.3 消费）、`placement`（1.4 定义与消费同任务）、`SavePipeline`（3.2 定义，3.3 消费）、`canMoveInto`（4.1 定义，3.3/4.2 消费）、`collectOutline`（3.7 定义，5.3 消费）。✓
- 占位符检查：Task 3.1 store 字段实现处标注了"按 App.tsx:97-105 现值填写"并给出完整接口——初始值属于照抄现状，不属于设计留白。其余任务代码完整。✓
