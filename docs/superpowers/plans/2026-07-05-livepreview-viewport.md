# livePreview inline decoration viewport 化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 livePreview 的 inline 级 decoration（mark / inline replace / atomic 集合）从全文档 StateField 迁移到 viewport 范围计算的 ViewPlugin，block 级 replace 保留在 StateField 并增加选择变化短路；顺手用「保留上次成功图 + debounce」消除图片 URL 编辑期的加载失败闪烁。

**Architecture:** `decorationSpecs.ts` 的 `collectDecorations` 拆成 `collectBlockDecorations(state)`（全文档，只收 block 级节点，同时返回 block 候选区域列表）与 `collectInlineDecorations(state, from, to)`（只遍历给定范围）；原 `collectDecorations` 保留为两者的全文档拼接（现有 decorationSpecs-*.test 不改）。`livePreviewPlugin.ts` 中 StateField 只装 block 级 decoration（CM6 要求 block 级只能来自 state），并按「区域 reveal 位图」短路选择变化；新增 ViewPlugin 按 `view.viewport` 构建 inline decoration 与 atomic 集合。对外导出 `livePreview`（合并 extension，Editor.tsx 不改）、`livePreviewAtomicRanges`（改为从 plugin 读取）。

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/view` ViewPlugin / `@codemirror/state` StateField), vitest 2（含 `vitest bench`), jsdom。

## Global Constraints

- 所有沟通、commit 说明遵循仓库惯例：conventional commits + 中文描述（如 `refactor(editor): …`），直接提交到 main（用户已确认，不建分支/worktree）。
- 不得改变对外导出名：`livePreview`、`livePreviewAtomicRanges` 必须继续可从 `livePreviewPlugin.ts` 导入且语义等价（`src/renderer/src/components/Editor.tsx:208-209` 不需要改动）。
- 行为保持：`test/decorationSpecs-*.test.ts`、`test/livePreview-dom.test.ts`、`test/richContentDecorations.test.ts`、`test/imageWidgetFallback.test.ts` 等现有测试必须全绿；仅允许对「直接内省 StateField 内部结构」的断言做与新架构等价的适配（本计划 Task 4 明确列出）。
- 测试命令：`npx vitest run`（全量）、`npx vitest run test/<file>`（单文件）、`npx vitest bench --run test/livePreview.bench.ts`（基准）。类型检查：`npm run typecheck:web`。
- CM6 约束：block 级 replace/widget decoration 只能由 StateField 提供；ViewPlugin 只能提供不跨行的 decoration（mark、line、inline widget/replace 均可）。
- 每个 Task 结束时 commit；commit 前该 Task 涉及的测试必须通过。

## 现状速览（实现者请先读这三个文件）

- `src/renderer/src/editor/livePreview/livePreviewPlugin.ts` — StateField 全量重建 deco+atomic，`revealSignature` 偏移级签名。
- `src/renderer/src/editor/livePreview/decorationSpecs.ts` — `collectDecorations(state)` 全文档 `tree.iterate` + 多次全文 `matchAll`。
- `src/renderer/src/editor/livePreview/widgets.ts` — `ImageWidget.toDOM` 的 error 回退链（本计划 Task 7 改造）。

---

### Task 1: 性能基准脚本 + 基线记录

**Files:**
- Create: `test/livePreview.bench.ts`
- Create: `docs/perf/livepreview-viewport.md`

**Interfaces:**
- Consumes: `collectDecorations(state)`（现有导出）。
- Produces: bench 文件（后续 Task 6 会在其中追加第二个 bench）；`docs/perf/livepreview-viewport.md` 中的基线数据表。

- [ ] **Step 1: 写 bench 文件**

vitest 的 `include` 只匹配 `*.test.ts`，bench 文件不会混进 `vitest run`。注意：先对 base state 调一次 `collectDecorations` 预热语法树（`ensureSyntaxTree` 的解析结果缓存在 language state 里，selection-only 的 `update` 派生 state 共享它），这样 bench 测的是收集成本而非解析成本——与真实场景（←/→ 时树已解析好）一致。

```ts
// test/livePreview.bench.ts
import { bench, describe } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

/** 2400 行混合文档：标题/粗斜体/任务/高亮/wiki/代码块/行内数学/图片。 */
function bigDoc(): string {
  const out: string[] = []
  for (let i = 0; i < 200; i++) {
    out.push(
      `# Section ${i}`,
      '',
      `Some **bold ${i}**, *italic*, and \`code\` with a [link](https://example.com/${i}).`,
      '',
      `- [ ] task ${i}`,
      `- item with ==highlight ${i}== and [[Wiki ${i}]]`,
      '',
      '```js',
      `const v${i} = ${i}`,
      '```',
      '',
      `para ${i} with $x_{${i}}^2$ inline math and ![img](pic${i}.png) mention`
    )
  }
  return out.join('\n')
}

const base = EditorState.create({
  doc: bigDoc(),
  extensions: [markdown({ base: markdownLanguage })]
})
// 预热解析缓存：bench 测收集成本，不测首次全文解析
collectDecorations(base)

const anchors = [0, 500, 5000, 20000, base.doc.length - 10]
const states = anchors.map((a) => base.update({ selection: { anchor: a } }).state)

describe(`livePreview decoration collection — ${base.doc.lines} 行文档`, () => {
  let i = 0
  bench('full-doc collectDecorations（旧：每次光标移动的成本）', () => {
    collectDecorations(states[i++ % states.length])
  })
})
```

- [ ] **Step 2: 运行 bench 记录基线**

Run: `npx vitest bench --run test/livePreview.bench.ts`
Expected: 输出 `full-doc collectDecorations` 的 hz / mean 等统计（无失败）。

- [ ] **Step 3: 写基线文档**

创建 `docs/perf/livepreview-viewport.md`，粘贴 Step 2 的实际数字（下面的表格数值是占位格式，必须替换为真实输出）：

```markdown
# livePreview viewport 化 — 性能对比

测试文档：2400 行混合 markdown（见 test/livePreview.bench.ts 的 bigDoc）。
命令：`npx vitest bench --run test/livePreview.bench.ts`

## 基线（重构前，commit <hash>）

| bench | mean | hz |
| --- | --- | --- |
| full-doc collectDecorations（旧路径） | <实测值> | <实测值> |

## 重构后

（Task 6 填写）
```

- [ ] **Step 4: Commit**

```bash
git add test/livePreview.bench.ts docs/perf/livepreview-viewport.md
git commit -m "test(editor): livePreview decoration 收集性能基准与基线记录"
```

---

### Task 2: collectDecorations 特征化快照（拆分护栏）

拆分前先把当前 `collectDecorations` 的输出「拍照」，Task 3 重构必须保持快照绿。归一化时**去重 + 排序**：拆分后 standalone 图片的 spec 会同时由 block/inline 两个收集器产出（字段完全相同的两条），去重后集合必须与拆分前一致。

**Files:**
- Create: `test/decorationSpecs-split.test.ts`

**Interfaces:**
- Consumes: `collectDecorations(state)`、`DecoSpec`（现有导出）。
- Produces: 快照文件 `test/__snapshots__/decorationSpecs-split.test.ts.snap`，Task 3 的回归护栏。

- [ ] **Step 1: 写特征化测试（当前代码即应通过）**

```ts
// test/decorationSpecs-split.test.ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

const DOC = [
  '---',
  'title: Doc',
  'tags: a, b',
  '---',
  '',
  '# Heading One',
  '',
  'prose anchor with **bold**, *italic*, ~~struck~~, `inline code`, ==mark== text.',
  '',
  '> plain quote line',
  '',
  '> [!note] Callout title',
  '> callout body',
  '',
  '- [x] done task',
  '- [ ] pending task',
  '- plain bullet',
  '',
  '1. first',
  '2. second',
  '',
  'A [link](https://example.com) and [[Wiki Target|shown]] and a footnote[^fn].',
  '',
  '[^fn]: footnote definition',
  '',
  '---',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '![standalone](pic.png)',
  '',
  'inline ![img](inline.png) here, media ![clip](clip.mp4 =320x)',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  'inline math $a+b$ end'
].join('\n')

const SPEC_KEYS = [
  'kind', 'from', 'to', 'revealed', 'level', 'checked', 'info',
  'source', 'width', 'height', 'title', 'folded', 'placement'
]

function stateWith(anchor: number): EditorState {
  return EditorState.create({
    doc: DOC,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

/** 去重 + 排序的规格集合：对 spec 顺序与重复不敏感，只对内容敏感。 */
function normalized(specs: DecoSpec[]): string[] {
  const seen = new Set<string>()
  for (const s of specs) seen.add(JSON.stringify(s, SPEC_KEYS))
  return [...seen].sort()
}

describe('collectDecorations 特征化（拆分护栏）', () => {
  it('光标在正文段落', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('prose anchor'))))).toMatchSnapshot()
  })
  it('光标在代码块内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('const x'))))).toMatchSnapshot()
  })
  it('光标在表格内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('| 1 |'))))).toMatchSnapshot()
  })
  it('光标在 callout 内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('callout body'))))).toMatchSnapshot()
  })
  it('光标在 frontmatter 内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('title:'))))).toMatchSnapshot()
  })
  it('光标在 standalone 图片行', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('![standalone]') + 3)))).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: 运行生成快照并确认绿**

Run: `npx vitest run test/decorationSpecs-split.test.ts`
Expected: 6 个用例 PASS，生成 `test/__snapshots__/decorationSpecs-split.test.ts.snap`。

- [ ] **Step 3: Commit**

```bash
git add test/decorationSpecs-split.test.ts test/__snapshots__
git commit -m "test(editor): collectDecorations 特征化快照，作为拆分护栏"
```

---

### Task 3: decorationSpecs 拆分为 block / inline 两个收集器

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Modify: `src/renderer/src/editor/livePreview/richContent.ts`（`collectMathRanges` / `collectHighlightRanges` 增加可选扫描范围参数；抽出 `collectMathBlockSpans`）
- Test: `test/decorationSpecs-viewport.test.ts`（新增）；`test/decorationSpecs-split.test.ts` 等全部现有测试保持绿

**Interfaces:**
- Consumes: `rangeRevealed` / `markerRevealed`（reveal.ts）、`collectFootnoteRefs` / `findFootnoteDef`（footnotes.ts，签名不变）、richContent 的解析函数。
- Produces（Task 4/5/6 依赖，签名必须逐字一致）:
  - `export interface BlockRegion { from: number; to: number }`
  - `export function collectBlockDecorations(state: EditorState): { specs: DecoSpec[]; regions: BlockRegion[] }` — 全文档；`regions` 是**无论 reveal 与否**的 block 候选区域（frontmatter、FencedCode、Table、callout Blockquote、mathBlock），供 StateField 做 reveal 位图短路。
  - `export function collectInlineDecorations(state: EditorState, rangeFrom: number, rangeTo: number): DecoSpec[]` — 只处理与 `[rangeFrom, rangeTo]`（扩展到整行）相交的内容。
  - `export function collectDecorations(state: EditorState): DecoSpec[]` — 兼容包装：`[...collectBlockDecorations(state).specs, ...collectInlineDecorations(state, 0, state.doc.length)]`。
  - richContent 新签名（默认参数保持旧行为，`test/richContentDecorations.test.ts` 不改）:
    - `collectMathRanges(state, tree, shouldSkip, inlineScanFrom = 0, inlineScanTo = state.doc.length)`
    - `collectHighlightRanges(state, tree, shouldSkip, scanFrom = 0, scanTo = state.doc.length)`
    - `export function collectMathBlockSpans(state: EditorState, shouldSkip: (pos: number) => boolean): Array<{ from: number; to: number }>` — 返回**含 revealed** 的全部 `$$…$$` 区间（配对必须从文档第 1 行起扫描，不能只扫 viewport）。

- [ ] **Step 1: 先写 viewport 限定的失败测试**

```ts
// test/decorationSpecs-viewport.test.ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  collectInlineDecorations,
  collectBlockDecorations
} from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

function manyParas(n: number): string {
  return Array.from({ length: n }, (_, i) => `para ${i} with **bold ${i}** and [[W${i}]]`).join('\n\n')
}

describe('collectInlineDecorations — 范围限定', () => {
  it('只产出与给定范围（按整行扩展）相交的 spec', () => {
    const state = stateWith(manyParas(100))
    const l40 = state.doc.line(79) // para 39 所在行（隔行空行，para i 在 line 2i+1）
    const l50 = state.doc.line(101)
    const specs = collectInlineDecorations(state, l40.from, l50.to)
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(s.to).toBeGreaterThanOrEqual(l40.from)
      expect(s.from).toBeLessThanOrEqual(l50.to)
    }
  })

  it('范围外的 bold / wiki 不产出', () => {
    const state = stateWith(manyParas(100))
    const specs = collectInlineDecorations(state, 0, state.doc.line(21).to)
    expect(specs.some((s) => s.kind === 'bold' && state.doc.sliceString(s.from, s.to).includes('bold 90'))).toBe(false)
    expect(specs.some((s) => s.kind === 'wikiLink' && s.info === 'W90')).toBe(false)
  })

  it('隐藏的代码块内部不产出 inline spec（fence 标记等）', () => {
    const doc = 'cursor line\n\n```js\nconst a = **not bold** \n```\n'
    const state = stateWith(doc, 0)
    const specs = collectInlineDecorations(state, 0, doc.length)
    const fenceFrom = doc.indexOf('```js')
    expect(specs.some((s) => s.from >= fenceFrom && s.kind !== 'image' && s.kind !== 'media')).toBe(false)
  })

  it('全范围调用 = 旧全文档行为的 inline 子集（heading/bold/task 都在）', () => {
    const doc = '# H1\n\n**b** and - text\n\n- [ ] task\n'
    const state = stateWith(doc, doc.length - 1)
    const specs = collectInlineDecorations(state, 0, doc.length)
    expect(specs.some((s) => s.kind === 'headingLine')).toBe(true)
    expect(specs.some((s) => s.kind === 'bold')).toBe(true)
    expect(specs.some((s) => s.kind === 'task')).toBe(true)
  })
})

describe('collectBlockDecorations — regions', () => {
  it('regions 含 revealed 与非 revealed 的 block 候选区域', () => {
    const doc = '---\nt: 1\n---\n\n```js\nx\n```\n\n| a |\n| - |\n| 1 |\n\n$$\ny\n$$\n\n> [!note] T\n> b\n'
    // 光标放进代码块（revealed）—— 它仍应出现在 regions 里
    const state = stateWith(doc, doc.indexOf('x'))
    const { regions } = collectBlockDecorations(state)
    const fenceFrom = doc.indexOf('```js')
    expect(regions.some((r) => r.from === 0)).toBe(true) // frontmatter
    expect(regions.some((r) => r.from === fenceFrom)).toBe(true) // revealed fence 也在
    expect(regions.some((r) => r.from === doc.indexOf('| a |'))).toBe(true)
    expect(regions.some((r) => r.from === doc.indexOf('$$'))).toBe(true)
    expect(regions.some((r) => r.from === doc.indexOf('> [!note]'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/decorationSpecs-viewport.test.ts`
Expected: FAIL —— `collectInlineDecorations` / `collectBlockDecorations` 未导出。

- [ ] **Step 3: richContent.ts 增加范围参数与 collectMathBlockSpans**

`collectMathRanges` 拆出 block 区间扫描（全文档逐行，配对有状态，必须从头扫），inline 正则只扫给定范围的切片；`collectHighlightRanges` 同理。完整替换这两个函数并新增导出：

```ts
export interface MathBlockSpan {
  from: number
  to: number
}

/**
 * 全部 `$$ … $$` block 区间（无论是否 revealed）。配对是有状态的，必须从
 * 文档第 1 行起扫描 —— viewport 中段起扫会导致开/闭 fence 错配。
 */
export function collectMathBlockSpans(
  state: EditorState,
  shouldSkip: (pos: number) => boolean
): MathBlockSpan[] {
  const doc = state.doc
  const spans: MathBlockSpan[] = []
  let lineNo = 1
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo)
    if (!/^\s*\$\$\s*$/.test(line.text) || shouldSkip(line.from)) {
      lineNo += 1
      continue
    }
    let closeNo = lineNo + 1
    while (closeNo <= doc.lines) {
      const close = doc.line(closeNo)
      if (/^\s*\$\$\s*$/.test(close.text)) break
      closeNo += 1
    }
    if (closeNo > doc.lines) break
    spans.push({ from: line.from, to: doc.line(closeNo).to })
    lineNo = closeNo + 1
  }
  return spans
}

export function collectMathRanges(
  state: EditorState,
  tree: Tree,
  shouldSkip: (pos: number) => boolean,
  inlineScanFrom = 0,
  inlineScanTo = state.doc.length
): MathRange[] {
  const ranges: MathRange[] = []
  const doc = state.doc
  const blockSpans = collectMathBlockSpans(state, shouldSkip)

  for (const span of blockSpans) {
    if (rangeRevealed(state, span.from, span.to)) continue
    const openLine = doc.lineAt(span.from)
    const closeLine = doc.lineAt(span.to)
    ranges.push({
      from: span.from,
      to: span.to,
      block: true,
      source: doc.sliceString(openLine.to + 1, closeLine.from).trim()
    })
  }

  const inMathBlock = (from: number): boolean =>
    blockSpans.some((span) => from >= span.from && from < span.to)
  const scanFrom = doc.lineAt(Math.max(0, Math.min(inlineScanFrom, doc.length))).from
  const scanTo = doc.lineAt(Math.max(0, Math.min(inlineScanTo, doc.length))).to
  const text = doc.sliceString(scanFrom, scanTo)
  const inlineRe = /(^|[^\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$/g
  for (const match of text.matchAll(inlineRe)) {
    const prefix = match[1] ?? ''
    const from = scanFrom + (match.index ?? 0) + prefix.length
    const to = from + match[0].length - prefix.length
    if (inMathBlock(from) || shouldSkip(from)) continue
    if (rangeRevealed(state, from, to)) continue
    ranges.push({ from, to, block: false, source: match[2] })
  }

  return ranges
}

export function collectHighlightRanges(
  state: EditorState,
  tree: Tree,
  shouldSkip: (pos: number) => boolean,
  scanFrom = 0,
  scanTo = state.doc.length
): HighlightRange[] {
  const ranges: HighlightRange[] = []
  const doc = state.doc
  const sliceFrom = doc.lineAt(Math.max(0, Math.min(scanFrom, doc.length))).from
  const sliceTo = doc.lineAt(Math.max(0, Math.min(scanTo, doc.length))).to
  const text = doc.sliceString(sliceFrom, sliceTo)
  const re = /(^|[^=\\])==([^=\n].*?[^=\n])==/g
  for (const match of text.matchAll(re)) {
    const prefix = match[1] ?? ''
    const markerFrom = sliceFrom + (match.index ?? 0) + prefix.length
    const markerTo = markerFrom + match[0].length - prefix.length
    if (shouldSkip(markerFrom) || rangeRevealed(state, markerFrom, markerTo)) continue
    ranges.push({ from: markerFrom + 2, to: markerTo - 2, markerFrom, markerTo })
  }
  return ranges
}
```

注意：`collectMathRanges` 原实现里 block 的 `source` 是 `sliceString(line.to + 1, close.from)`；上面用 openLine/closeLine 表达同一语义，切勿改成含 fence 行。

- [ ] **Step 4: 重写 decorationSpecs.ts 为双收集器**

保留 `DecoKind` / `DecoSpec` / `frontmatterEnd` / `eachLine` 原样。新增共享辅助与两个收集器，`collectDecorations` 改为包装。要点：

- 共享 `makeSkipAt(tree, fmEnd)`（原 `skipAt` 提为工厂）与 `imageSpecFor(state, node)`（原 Image 分支提为函数，block/inline 两边共用，保证 standalone 图片两边产出**字段完全一致**的 spec —— 特征化快照靠去重收敛）。
- block 收集器：frontmatter（properties/frontmatter 行）、FencedCode（隐藏→codeBlock/diagramBlock；revealed→codeLine 行）、Table、callout Blockquote、mathBlock、standalone 图片/媒体 spec；同时收 `regions`（无论 reveal）。
- inline 收集器：其余全部（heading、emphasis 系、inline code、QuoteMark/quoteLine、hr、list、task、link、图片/媒体（所有 placement 的 spec 都产出，供 hide/srcMark 与 inline widget）、footnote、wiki、mathInline、highlight），`tree.iterate({ from, to })` + 正则只扫范围切片。

完整代码（新增部分；`pushHide`、`blockRevealFor` 等从原函数内搬移）：

```ts
export interface BlockRegion {
  from: number
  to: number
}

function makeSkipAt(tree: Tree, fmEnd: number): (pos: number) => boolean {
  return (pos: number): boolean => {
    if (fmEnd > 0 && pos < fmEnd) return true
    let n: SyntaxNode | null = tree.resolveInner(pos, 1)
    while (n) {
      if (
        n.name === 'FencedCode' ||
        n.name === 'InlineCode' ||
        n.name === 'CodeText' ||
        n.name === 'Table'
      ) {
        return true
      }
      n = n.parent
    }
    return false
  }
}

/** Image/media 节点 → spec。block/inline 收集器共用，保证 standalone 图片两边产出一致。 */
function imageSpecFor(state: EditorState, node: SyntaxNode): DecoSpec {
  const doc = state.doc
  const urlNode = node.getChild('URL')
  const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
  let alt = ''
  let firstMark: { to: number } | null = null
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') {
      if (!firstMark) {
        firstMark = c
        continue
      }
      alt = doc.sliceString(firstMark.to, c.from)
      break
    }
  }
  const meta = parseImageMeta(alt, url)
  const line = doc.lineAt(node.from)
  const standalone = line.text.trim() === doc.sliceString(node.from, node.to)
  return {
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
  }
}

/**
 * Block 级 decoration 收集：全文档遍历，但只处理会产生 block widget/行装饰的
 * 节点。`regions` 是无论 reveal 与否的 block 候选区域，StateField 用它做
 * 「选择变化是否翻转了某个 block 的 reveal」的短路判断。
 */
export function collectBlockDecorations(state: EditorState): {
  specs: DecoSpec[]
  regions: BlockRegion[]
} {
  const specs: DecoSpec[] = []
  const regions: BlockRegion[] = []
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state)
  const doc = state.doc

  const fmEnd = frontmatterEnd(state)
  if (fmEnd > 0) {
    regions.push({ from: 0, to: fmEnd })
    if (rangeRevealed(state, 0, fmEnd)) {
      for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n)
        if (line.from >= fmEnd) break
        specs.push({ kind: 'frontmatter', from: line.from, to: line.from, revealed: true })
      }
    } else {
      specs.push({
        kind: 'properties',
        from: 0,
        to: fmEnd,
        revealed: false,
        source: doc.sliceString(0, fmEnd)
      })
    }
  }

  let blockGuardEnd = 0

  tree.iterate({
    enter: (node) => {
      const name = node.name
      if (node.to <= node.from) return
      if (fmEnd > 0 && node.from < fmEnd) return
      if (node.from < blockGuardEnd) return

      if (name === 'FencedCode') {
        regions.push({ from: node.from, to: node.to })
        if (!rangeRevealed(state, node.from, node.to)) {
          const firstLine = doc.lineAt(node.from)
          const info = firstLine.text.replace(/^[`~]+/, '').trim()
          const lines = doc.sliceString(node.from, node.to).split('\n')
          const body = lines.slice(1, lines.length - 1).join('\n')
          const diagramKind = diagramKindForInfo(info)
          specs.push({
            kind: diagramKind ? 'diagramBlock' : 'codeBlock',
            from: node.from,
            to: node.to,
            revealed: false,
            info: diagramKind ?? info,
            source: body
          })
          blockGuardEnd = node.to
        } else {
          for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
            kind: 'codeLine',
            from: lineFrom,
            to: lineFrom,
            revealed: false
          }))) {
            specs.push(s)
          }
        }
        return false
      }

      if (name === 'Table') {
        regions.push({ from: node.from, to: node.to })
        if (!rangeRevealed(state, node.from, node.to)) {
          specs.push({
            kind: 'table',
            from: node.from,
            to: node.to,
            revealed: false,
            source: doc.sliceString(node.from, node.to)
          })
          blockGuardEnd = node.to
        }
        return false
      }

      if (name === 'Blockquote') {
        const callout = parseCallout(doc.sliceString(node.from, node.to))
        if (callout) {
          regions.push({ from: node.from, to: node.to })
          if (!rangeRevealed(state, node.from, node.to)) {
            specs.push({
              kind: 'callout',
              from: node.from,
              to: node.to,
              revealed: false,
              info: callout.type,
              title: callout.title,
              folded: callout.folded,
              source: callout.body
            })
            blockGuardEnd = node.to
            return false
          }
        }
        return // revealed/普通引用可能内嵌 FencedCode，继续下钻
      }

      if (name === 'Image') {
        const spec = imageSpecFor(state, node.node)
        if (spec.placement === 'block') specs.push(spec)
        return false
      }
      return
    }
  })

  const skipAt = makeSkipAt(tree, fmEnd)
  const mathEnabledSpans = collectMathBlockSpans(state, skipAt)
  for (const span of mathEnabledSpans) {
    regions.push({ from: span.from, to: span.to })
    if (!rangeRevealed(state, span.from, span.to)) {
      const openLine = doc.lineAt(span.from)
      const closeLine = doc.lineAt(span.to)
      specs.push({
        kind: 'mathBlock',
        from: span.from,
        to: span.to,
        revealed: false,
        source: doc.sliceString(openLine.to + 1, closeLine.from).trim()
      })
    }
  }

  return { specs, regions }
}

/**
 * Inline 级 decoration 收集：只处理与 [rangeFrom, rangeTo]（扩展到整行）相交
 * 的内容。隐藏 block（fence/table/callout）的子树直接剪枝 —— 它们由 block 层
 * 的 widget 整体替换。
 */
export function collectInlineDecorations(
  state: EditorState,
  rangeFrom: number,
  rangeTo: number
): DecoSpec[] {
  const specs: DecoSpec[] = []
  const doc = state.doc
  const tree = ensureSyntaxTree(state, Math.min(Math.max(rangeTo, 0), doc.length), 5000) ?? syntaxTree(state)
  const from = doc.lineAt(Math.max(0, Math.min(rangeFrom, doc.length))).from
  const to = doc.lineAt(Math.max(0, Math.min(rangeTo, doc.length))).to
  const fmEnd = frontmatterEnd(state)

  const pushHide = (hFrom: number, hTo: number): void => {
    specs.push({ kind: 'hide', from: hFrom, to: hTo, revealed: rangeRevealed(state, hFrom, hTo) })
  }

  const blockRevealFor = (node: { parent: { name: string; from: number; to: number } | null }):
    | { from: number; to: number }
    | null => {
    let p = node.parent
    while (p) {
      if (p.name === 'FencedCode' || p.name === 'Blockquote') return { from: p.from, to: p.to }
      p = (p as unknown as { parent: typeof p }).parent
    }
    return null
  }

  tree.iterate({
    from,
    to,
    enter: (node) => {
      const name = node.name
      if (node.to <= node.from) return
      if (fmEnd > 0 && node.from < fmEnd) return

      // 隐藏的 block 容器：整棵子树剪枝（由 StateField 的 block widget 替换）
      if (name === 'FencedCode' || name === 'Table') {
        if (!rangeRevealed(state, node.from, node.to)) return false
        return // revealed：下钻让 CodeMark/CodeInfo 正常产出
      }
      if (name === 'Blockquote') {
        const callout = parseCallout(doc.sliceString(node.from, node.to))
        if (callout && !rangeRevealed(state, node.from, node.to)) return false
        for (const s of eachLine(
          state,
          Math.max(node.from, from),
          Math.min(node.to, to),
          (lineFrom) => ({ kind: 'quoteLine', from: lineFrom, to: lineFrom, revealed: false })
        )) {
          specs.push(s)
        }
        return
      }

      // ↓↓↓ 以下分支从原 collectDecorations 的 iterate 回调逐字搬移，逻辑不变 ↓↓↓
      // ATXHeading1..6 / HeaderMark / StrongEmphasis / Emphasis / Strikethrough /
      // EmphasisMark|StrikethroughMark / InlineCode / CodeMark / CodeInfo /
      // QuoteMark / HorizontalRule / ListItem / TaskMarker / Link
      // （原文件 178–221、254–261、295–298、317–382、419–441 行的 if 分支）

      if (name === 'Image') {
        specs.push(imageSpecFor(state, node.node))
        return false
      }
      return
    }
  })

  // 正则类收集：只扫范围切片，命中位置加 `from` 偏移
  const skipAt = makeSkipAt(tree, fmEnd)
  const scanText = doc.sliceString(from, to)
  let cachedFullText: string | null = null
  const fullText = (): string => (cachedFullText ??= doc.toString())

  for (const ref of collectFootnoteRefs(scanText)) {
    const refFrom = from + ref.index
    const refTo = refFrom + ref.length
    if (skipAt(refFrom)) continue
    const revealed = rangeRevealed(state, refFrom, refTo)
    if (!revealed) {
      specs.push({
        kind: 'footnoteRef',
        from: refFrom,
        to: refTo,
        revealed,
        source: ref.label,
        // 脚注定义可能在 viewport 外（通常在文末），懒取全文
        info: findFootnoteDef(fullText(), ref.label) ?? ''
      })
    }
  }

  const imageRe = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g
  for (const match of scanText.matchAll(imageRe)) {
    const mFrom = from + (match.index ?? 0)
    const mTo = mFrom + match[0].length
    if (skipAt(mFrom) || rangeRevealed(state, mFrom, mTo)) continue
    if (
      specs.some(
        (spec) => (spec.kind === 'image' || spec.kind === 'media') && spec.from === mFrom && spec.to === mTo
      )
    ) {
      continue
    }
    const meta = parseImageMeta(match[1], match[2])
    specs.push({
      kind: meta.mediaKind ? 'media' : 'image',
      from: mFrom,
      to: mTo,
      revealed: false,
      source: meta.url,
      info: meta.alt,
      title: meta.alt,
      width: meta.width,
      height: meta.height
    })
  }

  for (const math of collectMathRanges(state, tree, skipAt, from, to)) {
    if (math.block) continue
    specs.push({ kind: 'mathInline', from: math.from, to: math.to, revealed: false, source: math.source })
  }

  for (const highlight of collectHighlightRanges(state, tree, skipAt, from, to)) {
    specs.push({ kind: 'hide', from: highlight.markerFrom, to: highlight.markerFrom + 2, revealed: false })
    specs.push({ kind: 'highlight', from: highlight.from, to: highlight.to, revealed: false })
    specs.push({ kind: 'hide', from: highlight.markerTo - 2, to: highlight.markerTo, revealed: false })
  }

  const wikiRe = /\[\[([^\]\n]+)\]\]/g
  for (const m of scanText.matchAll(wikiRe)) {
    const wFrom = from + (m.index ?? 0)
    const wTo = wFrom + m[0].length
    if (skipAt(wFrom)) continue
    const inner = m[1]
    const pipeIdx = inner.indexOf('|')
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).split('#')[0].trim()
    const display = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : target
    const revealed = rangeRevealed(state, wFrom, wTo)
    specs.push({ kind: 'wikiLink', from: wFrom, to: wTo, revealed, info: target, source: display })
  }

  return specs
}

/** 兼容包装：全文档 block + inline。standalone 图片会重复产出一条（两层各一），调用方按 kind/placement 各取所需。 */
export function collectDecorations(state: EditorState): DecoSpec[] {
  return [
    ...collectBlockDecorations(state).specs,
    ...collectInlineDecorations(state, 0, state.doc.length)
  ]
}
```

「逐字搬移」注释处必须把原 iterate 回调里列出的分支原样复制进来（heading、emphasis、inline code、QuoteMark、hr、ListItem、TaskMarker、Link），删除原来的整段 `collectDecorations` 实现与其中不再使用的局部（`blockGuardEnd` 在 inline 收集器里不需要——剪枝用 `return false` 达成同样效果）。

- [ ] **Step 5: 运行拆分护栏 + 新测试 + 相关旧测试**

Run: `npx vitest run test/decorationSpecs-split.test.ts test/decorationSpecs-viewport.test.ts test/decorationSpecs-inline.test.ts test/decorationSpecs-block.test.ts test/decorationSpecs-block-reveal.test.ts test/decorationSpecs-task.test.ts test/decorationSpecs-image.test.ts test/decorationSpecs-wiki.test.ts test/decorationSpecs-eachline.test.ts test/decorationSpecs-frontmatter.test.ts test/richContentDecorations.test.ts test/footnotes.test.ts`
Expected: 全部 PASS。若特征化快照 diff：先核对是否只是「重复 spec」——不是的话说明拆分丢了行为，修实现而不是改快照。

- [ ] **Step 6: 全量测试 + 类型检查**

Run: `npx vitest run && npm run typecheck:web`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts src/renderer/src/editor/livePreview/richContent.ts test/decorationSpecs-viewport.test.ts
git commit -m "refactor(editor): collectDecorations 拆分为 block/inline 双收集器，inline 支持范围限定"
```

---

### Task 4: StateField 只管 block，新增 inline ViewPlugin（atomic 随迁）

**Files:**
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`（整体重写）
- Modify: `test/livePreview-dom.test.ts`（内省断言适配，见 Step 4）
- Test: `test/livePreview-dom.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `collectBlockDecorations` / `collectInlineDecorations` / `BlockRegion`。
- Produces:
  - `export const livePreviewBlock: StateField<LivePreviewBlockValue>` — value 含 `{ deco: DecorationSet; regions: readonly BlockRegion[]; bits: string }`（`bits` 本 Task 先始终重建，Task 5 启用短路）。
  - `export const livePreviewInline: ViewPlugin<…>` — 实例字段 `deco: DecorationSet`、`atomic: DecorationSet`。
  - `export const livePreview: Extension = [livePreviewBlock, livePreviewInline]`（对外名不变，Editor.tsx 不改）。
  - `export const livePreviewAtomicRanges` — 改为 `EditorView.atomicRanges.of((view) => view.plugin(livePreviewInline)?.atomic ?? Decoration.none)`。

- [ ] **Step 1: 重写 livePreviewPlugin.ts**

原 `buildDecorations` 的 switch 按 kind 一分为二。完整新文件骨架（mark 常量、widget import 与原文件相同，未列出的 case 体从原 switch 逐字搬移）：

```ts
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import {
  collectBlockDecorations,
  collectInlineDecorations,
  type BlockRegion
} from './decorationSpecs'
import { rangeRevealed } from './reveal'
// widget imports 与原文件一致

// hideMark / taskSrcMark / imageSrcMark / taskDoneMark / boldMark / italicMark /
// strikeMark / inlineCodeMark / linkMark / highlightMark / quoteLine / codeLine /
// frontmatterLine 常量原样保留

function resolveAsset(state: EditorState, src: string): string | null {
  const dp = state.facet(docPathFacet)
  const root = state.facet(vaultRootFacet)
  const cfg = state.facet(richContentConfigFacet)
  return isExternal(src) ? src : resolveMarkdownAsset(src, dp, root, cfg.assetsDir)
}

interface LivePreviewBlockValue {
  deco: DecorationSet
  regions: readonly BlockRegion[]
  /** 每个 region 一位：当前 selection 是否 reveal 它。Task 5 用于短路。 */
  bits: string
}

function revealBits(state: EditorState, regions: readonly BlockRegion[]): string {
  let bits = ''
  for (const r of regions) bits += rangeRevealed(state, r.from, r.to) ? '1' : '0'
  return bits
}

function buildBlockValue(state: EditorState): LivePreviewBlockValue {
  const { specs, regions } = collectBlockDecorations(state)
  const ranges: Range<Decoration>[] = []
  for (const s of specs) {
    switch (s.kind) {
      case 'frontmatter':
        ranges.push(frontmatterLine.range(s.from))
        break
      case 'codeLine':
        ranges.push(codeLine.range(s.from))
        break
      case 'properties':
        // 原 case 'properties' 体逐字搬移
        break
      case 'codeBlock':
        // 原 case 'codeBlock' 体逐字搬移
        break
      case 'diagramBlock':
        // 原 case 'diagramBlock' 体逐字搬移（cfg 从 state.facet 取，同原文）
        break
      case 'table':
        // 原 case 'table' 体逐字搬移
        break
      case 'mathBlock':
        // 原 case 'mathBlock' 体逐字搬移（含 cfg.mathEnabled 判断）
        break
      case 'callout':
        // 原 case 'callout' 体逐字搬移
        break
      case 'image':
      case 'media': {
        if (s.placement !== 'block') break
        const src = s.source ?? ''
        const resolved = resolveAsset(state, src)
        const widget =
          s.kind === 'media'
            ? new MediaBlockWidget(src, s.info ?? '', resolved, s.width, s.height)
            : new ImageBlockWidget(src, s.info ?? '', resolved, s.width, s.height)
        ranges.push(
          Decoration.widget({ widget, block: true, side: 1 }).range(state.doc.lineAt(s.to).to)
        )
        break
      }
    }
  }
  return { deco: Decoration.set(ranges, true), regions, bits: revealBits(state, regions) }
}

export const livePreviewBlock = StateField.define<LivePreviewBlockValue>({
  create: (state) => buildBlockValue(state),
  update(value, tr) {
    // Task 4 阶段：doc 或 selection 变化即重建（与旧行为一致）；Task 5 加短路
    if (tr.docChanged || tr.selection) return buildBlockValue(tr.state)
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

function revealSignature(state: EditorState): string {
  // 原函数逐字保留
}

function buildInlineDecorations(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const state = view.state
  const specs = collectInlineDecorations(state, view.viewport.from, view.viewport.to)
  const ranges: Range<Decoration>[] = []
  const atomic: Range<Decoration>[] = []

  function pushInlineReplace(deco: Decoration, from: number, to: number): void {
    ranges.push(deco.range(from, to))
    atomic.push(deco.range(from, to))
  }

  for (const s of specs) {
    switch (s.kind) {
      // 以下 case 从原 buildDecorations 逐字搬移：
      // 'hide' / 'headingLine' / 'bold' / 'italic' / 'strike' / 'inlineCode' /
      // 'link' / 'highlight' / 'linkIcon' / 'quoteLine' / 'hr' / 'task' /
      // 'taskDoneText' / 'footnoteRef' / 'wikiLink' / 'mathInline' /
      // 'listBullet' / 'listNumber'
      case 'image':
      case 'media': {
        const src = s.source ?? ''
        if (s.placement === 'block') {
          // block widget 由 StateField 提供；这里只管源行的隐藏/标注
          if (!s.revealed) {
            pushInlineReplace(hideMark, s.from, s.to)
          } else {
            ranges.push(imageSrcMark.range(s.from, s.to))
          }
        } else if (!s.revealed) {
          const resolved = resolveAsset(state, src)
          const widget =
            s.kind === 'media'
              ? new MediaWidget(src, s.info ?? '', resolved, s.width, s.height)
              : new ImageWidget(src, s.info ?? '', resolved, s.width, s.height)
          pushInlineReplace(Decoration.replace({ widget }), s.from, s.to)
        } else {
          ranges.push(imageSrcMark.range(s.from, s.to))
        }
        break
      }
    }
  }
  return { deco: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) }
}

export const livePreviewInline = ViewPlugin.fromClass(
  class {
    deco: DecorationSet
    atomic: DecorationSet
    sig: string

    constructor(view: EditorView) {
      this.sig = revealSignature(view.state)
      const built = buildInlineDecorations(view)
      this.deco = built.deco
      this.atomic = built.atomic
    }

    update(update: ViewUpdate): void {
      const sig = revealSignature(update.state)
      if (!update.docChanged && !update.viewportChanged && sig === this.sig) return
      this.sig = sig
      const built = buildInlineDecorations(update.view)
      this.deco = built.deco
      this.atomic = built.atomic
    }
  },
  { decorations: (v) => v.deco }
)

/** Inline replace 注册为 atomicRanges，光标不落进被隐藏的语法序列（同旧行为，来源改为 plugin）。 */
export const livePreviewAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(livePreviewInline)?.atomic ?? Decoration.none
)

/**
 * live-preview 装饰层入口：block 级来自 StateField（CM 要求），inline 级来自
 * viewport 限定的 ViewPlugin。
 */
export const livePreview: Extension = [livePreviewBlock, livePreviewInline]
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck:web`
Expected: PASS。

- [ ] **Step 3: 跑 DOM 冒烟测试，观察内省断言失败**

Run: `npx vitest run test/livePreview-dom.test.ts`
Expected: FAIL —— `state.field(livePreview)` 不再合法（livePreview 现在是 Extension 数组）。渲染类断言（heading/hr/checkbox/properties 等 DOM 查询）应仍 PASS —— 若这些也挂了，说明 jsdom 的 viewport 没覆盖小文档（CM 视口带 ±1000px margin，二十几行的测试文档应全覆盖）；此时排查 `view.viewport` 实际值，不要靠改测试掩盖。

- [ ] **Step 4: 适配 livePreview-dom.test.ts 的内省断言**

只改「读取内部结构」的方式，断言语义不变：

- import 行加 `livePreviewBlock, livePreviewInline`。
- 两个 image model 用例：`imgState.field(livePreview).deco` → `imgState.field(livePreviewBlock).deco`（extensions 数组里的 `livePreview` 不动——bundle 已含 field）。
- atomicRanges 三个用例：原来用纯 EditorState 读 `state.field(livePreview).atomic`，改为挂载 EditorView 后读 plugin：

```ts
it('atomic DecorationSet is non-empty for a doc with bold and task line', () => {
  const doc = 'Some **bold** text.\n- [ ] a task\ncursor here\n'
  view = mount(doc, doc.indexOf('cursor here'))
  const atomic = view.plugin(livePreviewInline)!.atomic
  expect(atomic.size).toBeGreaterThan(0)
})
```

第二个用例（`atomic set contains the hidden ** marker ranges`）同样改为 `mount(...)` + `view.plugin(livePreviewInline)!.atomic`，marker 位置断言不变。`it.skip` 的第三个用例注释保留。describe 标题 `livePreview StateField — DOM smoke` 改为 `livePreview (block StateField + inline ViewPlugin) — DOM smoke`。

- [ ] **Step 5: 全量测试**

Run: `npx vitest run && npm run typecheck:web`
Expected: 全绿（含 checkboxToggle-dom、tableInteraction 等挂载 `livePreview` 的测试）。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/editor/livePreview/livePreviewPlugin.ts test/livePreview-dom.test.ts
git commit -m "refactor(editor): inline decoration 迁移到 viewport ViewPlugin，block 保留 StateField"
```

---

### Task 5: block StateField 的选择变化短路

光标在纯文本里 ←/→ 时，没有任何 block 的 reveal 位翻转 → StateField 直接复用旧值（连全文档 tree.iterate 都不再发生）。

**Files:**
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts:update`（livePreviewBlock 的 update）
- Test: `test/livePreviewBlockField.test.ts`（新增）

**Interfaces:**
- Consumes: Task 4 的 `livePreviewBlock`、`LivePreviewBlockValue.bits`、`revealBits`。
- Produces: 无新导出；`livePreviewBlock` 值在无关选择变化下引用复用。

- [ ] **Step 1: 写失败测试**

```ts
// test/livePreviewBlockField.test.ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview, livePreviewBlock } from '@/editor/livePreview/livePreviewPlugin'

const DOC = 'para one\npara two\n\n```js\ncode line\n```\n\ntail para\n'

function create(anchor: number): EditorState {
  return EditorState.create({
    doc: DOC,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview]
  })
}

describe('livePreviewBlock — 选择变化短路', () => {
  it('prose 内移动光标：field 值引用复用', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)
    const s1 = s0.update({ selection: { anchor: 3 } }).state
    expect(s1.field(livePreviewBlock)).toBe(v0)
    const s2 = s1.update({ selection: { anchor: DOC.indexOf('tail') } }).state
    expect(s2.field(livePreviewBlock)).toBe(v0)
  })

  it('光标进入代码块：重建且 widget 消失；离开后 widget 回来', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)

    const inside = s0.update({ selection: { anchor: DOC.indexOf('code line') } }).state
    const vIn = inside.field(livePreviewBlock)
    expect(vIn).not.toBe(v0)
    let widgetInside = false
    vIn.deco.between(0, DOC.length, (_f, _t, d) => {
      if ((d as unknown as { spec: { block?: boolean; widget?: unknown } }).spec.widget) widgetInside = true
    })
    expect(widgetInside).toBe(false)

    const back = inside.update({ selection: { anchor: 0 } }).state
    const vBack = back.field(livePreviewBlock)
    expect(vBack).not.toBe(vIn)
    let widgetBack = false
    vBack.deco.between(0, DOC.length, (_f, _t, d) => {
      if ((d as unknown as { spec: { block?: boolean; widget?: unknown } }).spec.widget) widgetBack = true
    })
    expect(widgetBack).toBe(true)
  })

  it('文档变化总是重建', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)
    const s1 = s0.update({ changes: { from: 0, insert: 'x' } }).state
    expect(s1.field(livePreviewBlock)).not.toBe(v0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/livePreviewBlockField.test.ts`
Expected: 第一个用例 FAIL（当前 selection 变化总是重建，引用不同）。

- [ ] **Step 3: 实现短路**

`livePreviewBlock` 的 update 替换为：

```ts
  update(value, tr) {
    if (tr.docChanged) return buildBlockValue(tr.state)
    if (tr.selection) {
      // regions 在无 doc 变化时位置有效：仅当某个 block 的 reveal 位翻转才重建
      if (revealBits(tr.state, value.regions) === value.bits) return value
      return buildBlockValue(tr.state)
    }
    return value
  },
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run test/livePreviewBlockField.test.ts && npx vitest run`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/editor/livePreview/livePreviewPlugin.ts test/livePreviewBlockField.test.ts
git commit -m "perf(editor): block StateField 按 reveal 位图短路选择变化重建"
```

---

### Task 6: bench 复测与对比记录

**Files:**
- Modify: `test/livePreview.bench.ts`（追加 viewport bench）
- Modify: `docs/perf/livepreview-viewport.md`（填「重构后」表）

**Interfaces:**
- Consumes: `collectInlineDecorations`、`collectBlockDecorations`、Task 1 的 bench 基线。

- [ ] **Step 1: 追加重构后路径的 bench**

在 `test/livePreview.bench.ts` 的 describe 内追加（import 行补 `collectInlineDecorations, collectBlockDecorations`）：

```ts
  let j = 0
  bench('viewport collectInlineDecorations（新：±30 行窗口）', () => {
    const s = states[j++ % states.length]
    const head = s.selection.main.head
    const lineNo = s.doc.lineAt(head).number
    const from = s.doc.line(Math.max(1, lineNo - 30)).from
    const to = s.doc.line(Math.min(s.doc.lines, lineNo + 30)).to
    collectInlineDecorations(s, from, to)
  })

  let k = 0
  bench('block reveal 位图检查（新：prose 内光标移动的 StateField 成本）', () => {
    const s = states[k++ % states.length]
    // 模拟 field 短路路径：只算 revealBits，不重建
    const { regions } = blockValue
    let bits = ''
    for (const r of regions) {
      let hit = false
      for (const range of s.selection.ranges) {
        const lf = s.doc.lineAt(r.from).from
        const lt = s.doc.lineAt(r.to).to
        if (range.to >= lf && range.from <= lt) { hit = true; break }
      }
      bits += hit ? '1' : '0'
    }
    void bits
  })
```

并在 states 定义后加一次性预计算：`const blockValue = collectBlockDecorations(base)`。

- [ ] **Step 2: 运行 bench**

Run: `npx vitest bench --run test/livePreview.bench.ts`
Expected: 三个 bench 输出；viewport 路径 mean 应显著低于 full-doc 路径（预期 1–2 个数量级）。

- [ ] **Step 3: 记录对比**

把实测数字填进 `docs/perf/livepreview-viewport.md` 的「重构后」表，并写一行结论（旧路径每次 ←/→ 的成本 vs 新路径 inline 窗口 + block 位图检查之和、倍数）。

- [ ] **Step 4: Commit**

```bash
git add test/livePreview.bench.ts docs/perf/livepreview-viewport.md
git commit -m "test(editor): viewport 化前后 decoration 收集性能对比"
```

---

### Task 7: 图片 URL 编辑期闪烁改善（保留上次成功图 + debounce）

场景：standalone 图片行编辑 URL 时，源行 revealed 但行下的 `ImageBlockWidget` 持续存在；每敲一键 src 变化 → 新 widget → 加载失败 → error 回退链（`readAssetDataUrl` / `cacheRemoteMedia` 异步失败）→ 错误占位闪烁。改法：按「文档路径:行号」记住上次成功显示的 URL；新 widget 若目标 URL 未知好坏且有 last-good，先立即显示 last-good，`IMAGE_RETRY_DEBOUNCE_MS`(300ms) 后再尝试新 URL（打字中 widget 会先被销毁，等于天然跳过失败加载）；最终失败时若有 last-good 则回退显示它而不是错误文案。不传 `lineKey` 的调用（inline 图片、现有测试）行为完全不变。

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`（ImageWidget）
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`（buildBlockValue 给 ImageBlockWidget 传 lineKey）
- Test: `test/imageWidgetStale.test.ts`（新增）；`test/imageWidgetFallback.test.ts` 保持绿（不改）

**Interfaces:**
- Consumes: `docPathFacet`（livePreviewPlugin 侧取 lineKey）。
- Produces:
  - `ImageWidget` 构造器末尾新增可选参数 `readonly lineKey?: string`（`eq` 一并比较）。
  - `export const IMAGE_RETRY_DEBOUNCE_MS = 300`
  - `export function __resetImageWidgetCachesForTests(): void`（清空 imageDims 与 lastGood 映射）。

- [ ] **Step 1: 写失败测试**

```ts
// test/imageWidgetStale.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const readAssetDataUrl = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`
}))
vi.mock('@/lib/api', () => ({
  api: { readAssetDataUrl: (path: string) => readAssetDataUrl(path) }
}))

import {
  ImageWidget,
  IMAGE_RETRY_DEBOUNCE_MS,
  __resetImageWidgetCachesForTests
} from '@/editor/livePreview/widgets'

const view = { requestMeasure: vi.fn() } as never

function mountWidget(src: string, resolved: string, lineKey?: string): HTMLImageElement {
  const w = new ImageWidget(src, '', resolved, undefined, undefined, lineKey)
  const dom = w.toDOM(view)
  document.body.appendChild(dom)
  return dom.querySelector('img')!
}

describe('ImageWidget — 编辑期 last-good + debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetImageWidgetCachesForTests()
    readAssetDataUrl.mockRejectedValue(new Error('nope'))
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.textContent = ''
  })

  it('有 last-good 时先显示旧图，debounce 后才尝试新 URL', () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load')) // a.png 成功 → 记为 last-good

    const img2 = mountWidget('a.pn', '/v/a.pn', 'doc.md:3') // 编辑中的新 widget
    expect(img2.src).toContain(encodeURIComponent('/v/a.png')) // 立即显示旧图
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    expect(img2.src).toContain(encodeURIComponent('/v/a.pn')) // 到点尝试新 URL
  })

  it('新 URL 最终失败：回退显示 last-good，而非错误占位', async () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load'))

    const img2 = mountWidget('bad.png', '/v/bad.png', 'doc.md:3')
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    img2.dispatchEvent(new Event('error')) // 新 URL 加载失败 → 走回退链
    await Promise.resolve()
    await Promise.resolve() // readAssetDataUrl reject 落定

    expect(img2.src).toContain(encodeURIComponent('/v/a.png'))
    expect(img2.parentElement!.querySelector('.cm-image-error')).toBeNull()
  })

  it('无 lineKey：立即加载，最终失败仍显示错误占位（旧行为）', async () => {
    const img = mountWidget('bad.png', '/v/bad.png')
    expect(img.src).toContain(encodeURIComponent('/v/bad.png')) // 无 debounce
    img.dispatchEvent(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('.cm-image-error')).not.toBeNull()
  })

  it('widget 销毁后 debounce 定时器不触发加载', () => {
    const img1 = mountWidget('a.png', '/v/a.png', 'doc.md:3')
    img1.dispatchEvent(new Event('load'))
    const img2 = mountWidget('a.pn', '/v/a.pn', 'doc.md:3')
    img2.closest('.cm-image-wrap')!.remove() // CM 销毁旧 widget
    vi.advanceTimersByTime(IMAGE_RETRY_DEBOUNCE_MS)
    expect(img2.src).toContain(encodeURIComponent('/v/a.png')) // 仍是旧图，没有发起新加载
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/imageWidgetStale.test.ts`
Expected: FAIL —— `IMAGE_RETRY_DEBOUNCE_MS` / `__resetImageWidgetCachesForTests` 未导出、构造器无第 6 参。

- [ ] **Step 3: 改造 ImageWidget**

widgets.ts 中，`imageDims` 定义旁新增：

```ts
/** 每个「文档:行号」上次成功显示的 URL —— URL 编辑期间旧图兜底显示用。 */
const lastGoodByKey = new Map<string, string>()

export const IMAGE_RETRY_DEBOUNCE_MS = 300

export function __resetImageWidgetCachesForTests(): void {
  imageDims.clear()
  lastGoodByKey.clear()
}
```

`ImageWidget` 构造器追加 `readonly lineKey?: string`（第 6 个参数），`eq` 追加 `&& other.lineKey === this.lineKey`。`toDOM` 改造（完整替换加载与错误处理部分；mousedown 预览、`imageDims` 记录逻辑保留）：

```ts
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    if (!this.resolved) return this.renderError(wrap)

    let currentUrl = toDisplayUrl(this.resolved)
    let displayedUrl = ''
    let usedLastGood = false
    let triedLocalBytes = false
    let remoteFallbackUsed = false
    const img = document.createElement('img')
    img.alt = this.alt
    if (this.width) img.style.width = `${this.width}px`
    if (this.height) img.style.height = `${this.height}px`
    const dims = imageDims.get(currentUrl)
    if (dims) img.style.aspectRatio = `${dims.w} / ${dims.h}`

    const show = (url: string): void => {
      displayedUrl = url
      img.src = url
    }

    /** 最终失败：有 last-good 就回退旧图（编辑期不闪错误），否则错误占位。 */
    const showFailure = (failedUrl: string): void => {
      const lastGood = this.lineKey ? lastGoodByKey.get(this.lineKey) : undefined
      if (lastGood && !usedLastGood) {
        usedLastGood = true
        show(lastGood)
      } else {
        wrap.textContent = ''
        this.renderError(wrap, failedUrl)
      }
      view.requestMeasure()
    }

    img.addEventListener('mousedown', (event) => {
      // 原逻辑不变（detail.src 用 displayedUrl）
    })

    img.addEventListener('load', () => {
      if (!wrap.isConnected) return
      // 只有目标 URL（而非 last-good 兜底）加载成功才登记
      if (displayedUrl !== currentUrl) return
      if (this.lineKey) lastGoodByKey.set(this.lineKey, currentUrl)
      if (!imageDims.has(currentUrl)) {
        imageDims.set(currentUrl, { w: img.naturalWidth, h: img.naturalHeight })
        view.requestMeasure()
      }
    })

    img.addEventListener('error', () => {
      if (!wrap.isConnected) return
      if (displayedUrl !== currentUrl) return // last-good 兜底图失败：不进回退链

      // —— 原本地/远程回退链原样保留，仅两处改动 ——
      // 1) 链内所有 `img.src = currentUrl` 改为 `show(currentUrl)`（先更新 currentUrl 再 show）
      // 2) 链内所有「wrap.textContent = ''; this.renderError(wrap, failedUrl); view.requestMeasure()」
      //    整段替换为 `showFailure(failedUrl)`；结尾的最终分支同理替换为 `showFailure(currentUrl)`
    })

    const lastGood = this.lineKey ? lastGoodByKey.get(this.lineKey) : undefined
    if (!imageDims.has(currentUrl) && lastGood && lastGood !== currentUrl) {
      // URL 尚不知好坏且有旧图：先显示旧图，等编辑间隙再试新 URL。
      // 打字过程中本 widget 会先被销毁（isConnected=false），失败加载自然不发生。
      show(lastGood)
      window.setTimeout(() => {
        if (!wrap.isConnected) return
        show(currentUrl)
      }, IMAGE_RETRY_DEBOUNCE_MS)
    } else {
      show(currentUrl)
    }
    wrap.appendChild(img)
    return wrap
  }
```

注意逐字要求：回退链中 `.then((dataUrl) => { … currentUrl = dataUrl; img.src = currentUrl … })` 统一改为 `currentUrl = dataUrl; show(currentUrl)`，保证 `displayedUrl === currentUrl` 的判定在数据 URL 分支也成立。

- [ ] **Step 4: livePreviewPlugin 传 lineKey**

`buildBlockValue` 的 `case 'image': case 'media':` 分支中，构造 `ImageBlockWidget` 时传第 6 参（MediaBlockWidget 不传——媒体不在本次范围）：

```ts
        const line = state.doc.lineAt(s.to)
        const lineKey = `${state.facet(docPathFacet) ?? ''}:${line.number}`
        const widget =
          s.kind === 'media'
            ? new MediaBlockWidget(src, s.info ?? '', resolved, s.width, s.height)
            : new ImageBlockWidget(src, s.info ?? '', resolved, s.width, s.height, lineKey)
```

- [ ] **Step 5: 运行新旧测试**

Run: `npx vitest run test/imageWidgetStale.test.ts test/imageWidgetFallback.test.ts test/richContentWidgets.test.ts`
Expected: 全 PASS（fallback 测试不传 lineKey，行为不变）。

- [ ] **Step 6: 全量测试 + 类型检查 + Commit**

Run: `npx vitest run && npm run typecheck:web`

```bash
git add src/renderer/src/editor/livePreview/widgets.ts src/renderer/src/editor/livePreview/livePreviewPlugin.ts test/imageWidgetStale.test.ts
git commit -m "fix(editor): 图片 URL 编辑期保留上次成功图并 debounce 重试，消除失败闪烁"
```

---

### Task 8: 全量回归收尾

**Files:**
- 无新文件；确认工作区干净、全部验证命令通过。

- [ ] **Step 1: 全量验证**

Run: `npx vitest run && npm run typecheck && npx vitest bench --run test/livePreview.bench.ts`
Expected: 测试全绿、两个 typecheck PASS、bench 正常输出。

- [ ] **Step 2: 核对 git log 与工作区**

Run: `git status && git log --oneline -8`
Expected: 工作区干净；Task 1–7 的 commit 依序在 main 上。

## Self-Review 记录

- Spec 覆盖：inline→ViewPlugin+viewport（Task 3/4）、block 保留 StateField（Task 4）、atomicRanges 随迁（Task 4）、测试全绿（各 Task 步内验证 + Task 2 护栏）、2000+ 行前后对比（Task 1/6）、图片闪烁顺手项（Task 7）。✓
- 类型/签名一致性：`collectInlineDecorations(state, rangeFrom, rangeTo)` 在 Task 3 定义、Task 4/6 按同签名消费；`BlockRegion`、`livePreviewBlock`、`livePreviewInline`、`IMAGE_RETRY_DEBOUNCE_MS` 各处拼写一致。✓
- 已知风险与对策：① jsdom viewport 覆盖问题（Task 4 Step 3 有排查指引）；② standalone 图片 spec 双产出（Task 2 归一化去重明确处理）；③ `$$` 配对必须全文扫描（Task 3 的 `collectMathBlockSpans` 注释固定此约束）。
