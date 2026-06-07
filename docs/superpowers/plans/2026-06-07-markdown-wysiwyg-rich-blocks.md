# Markdown WYSIWYG Rich Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Margin's live-preview so headings have no underline, code blocks scroll horizontally with syntax highlighting, GFM tables render as editable HTML tables, and frontmatter renders as an editable Obsidian-style properties panel.

**Architecture:** Three rich blocks (code, table, properties) share one pattern: a block-level CodeMirror `Decoration.replace` widget built from plain DOM, with bidirectional sync back to the markdown source via `view.dispatch()`, and cursor-reveal of raw text (`rangeRevealed()`). Pure markdown↔model logic lives in separate testable modules; DOM/CM side-effects live in widgets and decoration specs. A custom `HighlightStyle` replaces CodeMirror's default (which underlines headings) and supplies code token colors.

**Tech Stack:** CodeMirror 6 (`@codemirror/view`, `@codemirror/language`, `@lezer/highlight`), `@codemirror/language-data`, `js-yaml`, TypeScript, React 18, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-07-markdown-wysiwyg-rich-blocks-design.md`

---

## File Structure

| File | Responsibility | New? |
| --- | --- | --- |
| `src/renderer/src/editor/livePreview/highlightStyle.ts` | Custom `HighlightStyle` — headings no underline + code token colors | new |
| `src/renderer/src/editor/livePreview/tableModel.ts` | `parseTable` / `serializeTable` (pure) | new |
| `src/renderer/src/editor/livePreview/frontmatterModel.ts` | `parseFrontmatter` / `serializeFrontmatter` (pure) | new |
| `src/renderer/src/editor/livePreview/codeHighlight.ts` | Async language load + `highlightCodeToHtml` (DOM-free string builder) | new |
| `src/renderer/src/editor/livePreview/widgets.ts` | Add `CodeBlockWidget`, `TableWidget`, `PropertiesWidget` | modify |
| `src/renderer/src/editor/livePreview/decorationSpecs.ts` | Emit table/code/frontmatter block specs | modify |
| `src/renderer/src/editor/livePreview/livePreviewPlugin.ts` | Render new block widgets; pass `view` to widgets | modify |
| `src/renderer/src/editor/livePreview/theme.ts` | `.cm-code-render`, `.cm-table-render`, `.cm-properties` styles | modify |
| `src/renderer/src/components/Editor.tsx` | Swap `defaultHighlightStyle`→`marginHighlightStyle` | modify |
| `test/tableModel.test.ts` | Unit tests | new |
| `test/frontmatterModel.test.ts` | Unit tests | new |
| `package.json` | `js-yaml` → dependencies, `@types/js-yaml` → devDeps | modify |

**Key design note on widget→source sync:** `decorationSpecs.ts` is pure (no `view`). Widgets need `view` to dispatch. The plugin already calls `buildDecorations(state)`; we extend specs with the data each widget needs (source text, region `from`/`to`), and the plugin constructs widgets passing the live `view`. Each widget stores its region `from`/`to` and the originating source string; on edit it computes new markdown and dispatches `{ changes: { from, to, insert } }`.

---

## Phase 1: Custom HighlightStyle (headings no underline + code colors)

### Task 1: Create `marginHighlightStyle`

**Files:**
- Create: `src/renderer/src/editor/livePreview/highlightStyle.ts`
- Modify: `src/renderer/src/components/Editor.tsx`

- [ ] **Step 1: Write `highlightStyle.ts`**

```typescript
import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Custom syntax-highlight style. Replaces CodeMirror's defaultHighlightStyle,
 * whose `tags.heading` rule adds `text-decoration: underline` — the source of
 * the unwanted heading underline. Heading weight is handled by theme.ts `.cm-h*`,
 * so here headings get NO decoration. Also defines code-token colors (reused by
 * the fenced-code widget via classes mounted through syntaxHighlighting()).
 */
export const marginHighlightStyle = HighlightStyle.define([
  // Headings: explicitly no underline. (Weight comes from .cm-h* in theme.ts.)
  { tag: t.heading, textDecoration: 'none' },

  // Code tokens — colors from tokens.css semantic vars.
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--code-variable)' },
  { tag: [t.propertyName], color: 'var(--code-property)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--code-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--code-constant)' },
  { tag: [t.string, t.inserted, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-number)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--code-type)' },
  { tag: [t.comment, t.meta], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.operator, t.operatorKeyword], color: 'var(--code-operator)' },
  { tag: [t.regexp, t.escape], color: 'var(--code-string)' },
  { tag: t.invalid, color: 'var(--code-invalid)' }
])
```

- [ ] **Step 2: Add code-color CSS vars to `tokens.css`**

In `src/renderer/src/theme/tokens.css`, add to the dark `:root` block (near other color tokens) and the `[data-theme="light"]` block. Dark values:

```css
  --code-keyword: #c792ea;
  --code-variable: #e6e6e6;
  --code-property: #82aaff;
  --code-function: #82aaff;
  --code-constant: #f78c6c;
  --code-string: #c3e88d;
  --code-number: #f78c6c;
  --code-type: #ffcb6b;
  --code-comment: #7a8499;
  --code-operator: #89ddff;
  --code-invalid: #ff5370;
```

Light values:

```css
  --code-keyword: #9c27b0;
  --code-variable: #24292e;
  --code-property: #1565c0;
  --code-function: #1565c0;
  --code-constant: #c25800;
  --code-string: #2e7d32;
  --code-number: #c25800;
  --code-type: #b8860b;
  --code-comment: #8a919e;
  --code-operator: #0277bd;
  --code-invalid: #d32f2f;
```

(Read `tokens.css` first to find the exact `:root` and `[data-theme="light"]` selectors and insert inside each.)

- [ ] **Step 3: Swap the highlight style in `Editor.tsx`**

Change the import line:
```typescript
import { syntaxHighlighting } from '@codemirror/language'
import { marginHighlightStyle } from '@/editor/livePreview/highlightStyle'
```
(remove `defaultHighlightStyle` from the `@codemirror/language` import.)

Change the extension:
```typescript
        syntaxHighlighting(marginHighlightStyle, { fallback: true }),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Visual verify (screenshot)**

Run `npm run dev` (background), open a note with `# 标题一`, screenshot the Electron window. Expected: heading is bold with NO underline. See "Screenshot verification" appendix for the capture command.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/editor/livePreview/highlightStyle.ts src/renderer/src/theme/tokens.css src/renderer/src/components/Editor.tsx
git commit -m "fix(editor): custom highlight style removes heading underline, adds code colors"
```

---

## Phase 2: Code block widget (horizontal scroll + highlight)

### Task 2: Code highlight helper (`codeHighlight.ts`)

**Files:**
- Create: `src/renderer/src/editor/livePreview/codeHighlight.ts`

- [ ] **Step 1: Write `codeHighlight.ts`**

```typescript
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightCode } from '@lezer/highlight'
import { marginHighlightStyle } from './highlightStyle'

/**
 * Build highlighted HTML for `code` in the given language into `target`
 * (a <code> element). Uses the loaded Lezer parser + marginHighlightStyle so
 * colors match the editor. Synchronous path when the language parser is already
 * loaded; otherwise renders plain text and the caller re-runs after load.
 */
export function highlightInto(target: HTMLElement, code: string, support: {
  language: { parser: { parse(code: string): import('@lezer/common').Tree } }
}): void {
  target.textContent = ''
  const tree = support.language.parser.parse(code)
  highlightCode(
    code,
    tree,
    marginHighlightStyle,
    (text, classes) => {
      const span = document.createElement('span')
      if (classes) span.className = classes
      span.textContent = text
      target.appendChild(span)
    },
    () => target.appendChild(document.createElement('br'))
  )
}

/** Find a LanguageDescription by fenced-code info string (e.g. "ts", "python"). */
export function findLanguage(info: string): LanguageDescription | null {
  if (!info) return null
  return LanguageDescription.matchLanguageName(languages, info, true)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `@lezer/common` Tree type import errors, change the param type to `{ language: { parser: { parse(code: string): unknown } } }` and cast `tree as never` into `highlightCode`'s second arg — `highlightCode(code, tree as Parameters<typeof highlightCode>[1], ...)`.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/editor/livePreview/codeHighlight.ts
git commit -m "feat(editor): code highlight helper for fenced-code widget"
```

### Task 3: `CodeBlockWidget`

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`

- [ ] **Step 1: Append `CodeBlockWidget` to `widgets.ts`**

```typescript
import { findLanguage, highlightInto } from './codeHighlight'

/**
 * Renders a fenced code block as a horizontally-scrollable, syntax-highlighted
 * <pre>. Read-only render view; the live-preview plugin reveals raw editable
 * lines when the cursor enters the fence region.
 */
export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly info: string
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return other.code === this.code && other.info === this.info
  }

  toDOM(): HTMLElement {
    const pre = document.createElement('pre')
    pre.className = 'cm-code-render'
    if (this.info) {
      const tag = document.createElement('span')
      tag.className = 'cm-code-lang'
      tag.textContent = this.info
      pre.appendChild(tag)
    }
    const codeEl = document.createElement('code')
    codeEl.textContent = this.code
    pre.appendChild(codeEl)

    const desc = findLanguage(this.info)
    if (desc) {
      if (desc.support) {
        highlightInto(codeEl, this.code, desc.support)
      } else {
        void desc.load().then((support) => {
          // DOM may have been replaced; guard with isConnected.
          if (codeEl.isConnected) highlightInto(codeEl, this.code, support)
        })
      }
    }
    return pre
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/editor/livePreview/widgets.ts
git commit -m "feat(editor): CodeBlockWidget renders highlighted scrollable code"
```

### Task 4: Emit code-block spec + render it; add styles

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Modify: `src/renderer/src/editor/livePreview/theme.ts`

- [ ] **Step 1: Extend `DecoKind` and `DecoSpec` in `decorationSpecs.ts`**

In the `DecoKind` union add `| 'codeBlock'`. In `DecoSpec` add optional fields:
```typescript
  info?: string
  source?: string
```

- [ ] **Step 2: Emit `codeBlock` spec for `FencedCode` (replace per-line when not revealed)**

In `collectDecorations`, replace the existing `FencedCode` handler with:

```typescript
      // Fenced code: render as scrollable highlighted block when the cursor is
      // outside; reveal raw editable lines (cm-code-block) when inside.
      if (name === 'FencedCode') {
        const revealed = rangeRevealed(state, node.from, node.to)
        if (!revealed) {
          const source = doc.sliceString(node.from, node.to)
          // info string = text after the opening ```; first line minus fence.
          const firstLine = doc.lineAt(node.from)
          const info = firstLine.text.replace(/^[`~]+/, '').trim()
          // strip the opening/closing fence lines for the rendered code body
          const lines = source.split('\n')
          const body = lines.slice(1, lines.length - 1).join('\n')
          specs.push({
            kind: 'codeBlock',
            from: node.from,
            to: node.to,
            revealed: false,
            info,
            source: body
          })
          return
        }
        for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
          kind: 'codeLine',
          from: lineFrom,
          to: lineFrom,
          revealed: false
        }))) {
          specs.push(s)
        }
        return
      }
```

Also: keep the `CodeInfo` handler — but it only matters in the revealed branch (raw lines). When not revealed, the whole `FencedCode` is replaced so the inner `CodeInfo`/`CodeMark` nodes are covered by the block replacement; CodeMirror drops point decorations inside a block-replace range, so no conflict.

- [ ] **Step 3: Render the widget in `livePreviewPlugin.ts`**

Add import:
```typescript
import { CheckboxWidget, HrWidget, CodeBlockWidget } from './widgets'
```
Add a case in the `switch (s.kind)`:
```typescript
      case 'codeBlock':
        ranges.push(
          Decoration.replace({
            widget: new CodeBlockWidget(s.source ?? '', s.info ?? ''),
            block: true
          }).range(s.from, s.to)
        )
        break
```

- [ ] **Step 4: Add styles in `theme.ts`**

Add to the `EditorView.theme({...})` object:
```typescript
  '.cm-code-render': {
    position: 'relative',
    fontFamily: MONO,
    fontSize: '0.88em',
    lineHeight: '1.55',
    background: 'var(--bg-elev)',
    border: '1px solid var(--border-soft)',
    borderRadius: '8px',
    padding: '12px 14px',
    margin: '8px 0',
    overflowX: 'auto',
    whiteSpace: 'pre'
  },
  '.cm-code-render code': { whiteSpace: 'pre', fontFamily: MONO },
  '.cm-code-lang': {
    position: 'absolute',
    top: '6px',
    right: '10px',
    fontSize: '0.72em',
    color: 'var(--text-faint)',
    userSelect: 'none'
  },
```

- [ ] **Step 5: Typecheck + unit tests**

Run: `npm run typecheck && npm run test`
Expected: all pass (existing tests unaffected).

- [ ] **Step 6: Visual verify (screenshot)**

`npm run dev`, open a note containing a fenced ```ts block with a very long line. Screenshot. Expected: rounded code card, syntax colors, horizontal scrollbar on the long line; clicking into it reveals raw text.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts src/renderer/src/editor/livePreview/livePreviewPlugin.ts src/renderer/src/editor/livePreview/theme.ts
git commit -m "feat(editor): render fenced code as scrollable highlighted block"
```

---

## Phase 3: Table model + widget (inline cell editing)

### Task 5: `tableModel.ts` (TDD)

**Files:**
- Create: `test/tableModel.test.ts`
- Create: `src/renderer/src/editor/livePreview/tableModel.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { parseTable, serializeTable } from '../src/renderer/src/editor/livePreview/tableModel'

describe('tableModel', () => {
  const md = ['| A | B |', '| :-- | --: |', '| 1 | 2 |', '| 3 | 4 |'].join('\n')

  it('parses header, alignment, rows', () => {
    const m = parseTable(md)
    expect(m.header).toEqual(['A', 'B'])
    expect(m.align).toEqual(['left', 'right'])
    expect(m.rows).toEqual([['1', '2'], ['3', '4']])
  })

  it('round-trips to normalized markdown', () => {
    const m = parseTable(md)
    const out = serializeTable(m)
    expect(parseTable(out)).toEqual(m)
  })

  it('handles escaped pipes in cells', () => {
    const m = parseTable('| a |\n| --- |\n| x \\| y |')
    expect(m.rows[0][0]).toBe('x | y')
    expect(serializeTable(m)).toContain('x \\| y')
  })

  it('defaults alignment to null when no colons', () => {
    const m = parseTable('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(m.align).toEqual([null, null])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tableModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tableModel.ts`**

```typescript
export type Align = 'left' | 'center' | 'right' | null

export interface TableModel {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** Split a `|`-delimited markdown row into trimmed cells, honoring `\|` escapes. */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|'
      i++
    } else if (ch === '|') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  // Drop empty leading/trailing cells produced by surrounding pipes.
  if (cells.length && cells[0].trim() === '') cells.shift()
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

function parseAlign(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

export function parseTable(source: string): TableModel {
  const lines = source.split('\n').filter((l) => l.trim() !== '')
  const header = splitRow(lines[0] ?? '')
  const align = splitRow(lines[1] ?? '').map(parseAlign)
  const rows = lines.slice(2).map(splitRow)
  return { header, align, rows }
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function delimCell(a: Align): string {
  switch (a) {
    case 'left':
      return ':---'
    case 'right':
      return '---:'
    case 'center':
      return ':---:'
    default:
      return '---'
  }
}

export function serializeTable(m: TableModel): string {
  const cols = m.header.length
  const row = (cells: string[]): string =>
    '| ' + Array.from({ length: cols }, (_, i) => escapeCell(cells[i] ?? '')).join(' | ') + ' |'
  const delim = '| ' + Array.from({ length: cols }, (_, i) => delimCell(m.align[i] ?? null)).join(' | ') + ' |'
  return [row(m.header), delim, ...m.rows.map(row)].join('\n')
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tableModel`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add test/tableModel.test.ts src/renderer/src/editor/livePreview/tableModel.ts
git commit -m "feat(editor): table markdown<->model pure functions"
```

### Task 6: `TableWidget`

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`

- [ ] **Step 1: Append `TableWidget`**

```typescript
import type { EditorView } from '@codemirror/view'
import { parseTable, serializeTable, type Align } from './tableModel'

const ALIGN_CSS: Record<Exclude<Align, null>, string> = {
  left: 'left',
  center: 'center',
  right: 'right'
}

/**
 * Renders a GFM table as an editable HTML <table>. Cells are contenteditable;
 * edits commit on blur / compositionend (IME-safe) by re-serializing the model
 * and dispatching a source replacement over [from, to].
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly view: EditorView
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to
  }

  toDOM(): HTMLElement {
    const model = parseTable(this.source)
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap'
    const table = document.createElement('table')
    table.className = 'cm-table-render'

    let composing = false

    const commit = (): void => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.textContent ?? '')
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).map((c) => c.textContent ?? '')
      )
      const next = serializeTable({ header, align: model.align, rows })
      if (next === this.source) return
      this.view.dispatch({ changes: { from: this.from, to: this.to, insert: next } })
    }

    const wireCell = (td: HTMLTableCellElement, align: Align): void => {
      td.contentEditable = 'true'
      td.spellcheck = false
      if (align) td.style.textAlign = ALIGN_CSS[align]
      td.addEventListener('compositionstart', () => {
        composing = true
      })
      td.addEventListener('compositionend', () => {
        composing = false
        commit()
      })
      td.addEventListener('blur', () => {
        if (!composing) commit()
      })
    }

    const thead = document.createElement('thead')
    const htr = document.createElement('tr')
    model.header.forEach((cell, i) => {
      const th = document.createElement('th')
      th.textContent = cell
      wireCell(th, model.align[i] ?? null)
      htr.appendChild(th)
    })
    thead.appendChild(htr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    model.rows.forEach((row) => {
      const tr = document.createElement('tr')
      model.header.forEach((_, i) => {
        const td = document.createElement('td')
        td.textContent = row[i] ?? ''
        wireCell(td, model.align[i] ?? null)
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    wrap.appendChild(table)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/editor/livePreview/widgets.ts
git commit -m "feat(editor): TableWidget with inline editable cells"
```

### Task 7: Emit table spec + render it; add styles

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Modify: `src/renderer/src/editor/livePreview/theme.ts`

- [ ] **Step 1: Extend `DecoKind`**

Add `| 'table'` to `DecoKind`. (`source`, `from`, `to` already exist on `DecoSpec` from Task 4 / base.)

- [ ] **Step 2: Emit `table` spec in `collectDecorations`**

Add a handler (place it alongside other block handlers, before the `Link` handler):

```typescript
      // GFM table: render as editable HTML table when cursor is outside; reveal
      // raw markdown when inside for complex edits (add/remove rows).
      if (name === 'Table') {
        const revealed = rangeRevealed(state, node.from, node.to)
        if (!revealed) {
          specs.push({
            kind: 'table',
            from: node.from,
            to: node.to,
            revealed: false,
            source: doc.sliceString(node.from, node.to)
          })
        }
        return
      }
```

(Returning when revealed leaves the raw markdown un-decorated = plain editable text, which is the desired reveal behavior.)

- [ ] **Step 3: Render in `livePreviewPlugin.ts`**

The plugin's `buildDecorations(state)` has no `view`. Tables need `view`. Change the plugin so `buildDecorations` receives the view:

In the `ViewPlugin` class, change both calls:
```typescript
    constructor(view: EditorView) {
      this.view = view
      this.decorations = buildDecorations(view.state, view)
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state, update.view)
      }
    }
```
Add `view: EditorView` field to the class. Change the signature:
```typescript
function buildDecorations(state: EditorState, view: EditorView): DecorationSet {
```
Add import of `TableWidget`:
```typescript
import { CheckboxWidget, HrWidget, CodeBlockWidget, TableWidget } from './widgets'
```
Add the case:
```typescript
      case 'table':
        ranges.push(
          Decoration.replace({
            widget: new TableWidget(s.source ?? '', s.from, s.to, view),
            block: true
          }).range(s.from, s.to)
        )
        break
```

- [ ] **Step 4: Add styles in `theme.ts`**

```typescript
  '.cm-table-wrap': { overflowX: 'auto', margin: '10px 0' },
  '.cm-table-render': {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '0.95em'
  },
  '.cm-table-render th, .cm-table-render td': {
    border: '1px solid var(--border)',
    padding: '6px 11px',
    textAlign: 'left'
  },
  '.cm-table-render th': {
    background: 'var(--bg-elev)',
    fontWeight: '600'
  },
  '.cm-table-render td:focus, .cm-table-render th:focus': {
    outline: '2px solid var(--accent-line)',
    outlineOffset: '-2px'
  },
```

- [ ] **Step 5: Typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: all pass.

- [ ] **Step 6: Visual verify (screenshot)**

`npm run dev`, open a note with a GFM table. Screenshot. Expected: bordered table, header shaded, alignment respected; clicking a cell lets you type (test Chinese input); blur updates source.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts src/renderer/src/editor/livePreview/livePreviewPlugin.ts src/renderer/src/editor/livePreview/theme.ts
git commit -m "feat(editor): render GFM tables as editable HTML tables"
```

---

## Phase 4: Frontmatter model + properties panel widget

### Task 8: Add `js-yaml` as a direct dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `npm install js-yaml@^4.1.0 && npm install -D @types/js-yaml`
Expected: `package.json` lists `js-yaml` in dependencies and `@types/js-yaml` in devDependencies.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add js-yaml as direct dependency for frontmatter parsing"
```

### Task 9: `frontmatterModel.ts` (TDD)

**Files:**
- Create: `test/frontmatterModel.test.ts`
- Create: `src/renderer/src/editor/livePreview/frontmatterModel.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  serializeFrontmatter
} from '../src/renderer/src/editor/livePreview/frontmatterModel'

describe('frontmatterModel', () => {
  const src = ['---', 'title: Hello', 'tags:', '  - a', '  - b', 'done: true', 'count: 3', 'date: 2026-06-07', '---'].join('\n')

  it('parses fields with inferred types', () => {
    const f = parseFrontmatter(src)
    const byKey = Object.fromEntries(f.map((x) => [x.key, x]))
    expect(byKey.title.type).toBe('text')
    expect(byKey.title.value).toBe('Hello')
    expect(byKey.tags.type).toBe('list')
    expect(byKey.tags.value).toEqual(['a', 'b'])
    expect(byKey.done.type).toBe('checkbox')
    expect(byKey.done.value).toBe(true)
    expect(byKey.count.type).toBe('number')
    expect(byKey.count.value).toBe(3)
    expect(byKey.date.type).toBe('date')
  })

  it('preserves key order on round-trip', () => {
    const f = parseFrontmatter(src)
    const out = serializeFrontmatter(f)
    const f2 = parseFrontmatter(out)
    expect(f2.map((x) => x.key)).toEqual(['title', 'tags', 'done', 'count', 'date'])
  })

  it('returns empty array when no frontmatter', () => {
    expect(parseFrontmatter('# just a heading')).toEqual([])
  })

  it('serializes a list field back to YAML', () => {
    const out = serializeFrontmatter([{ key: 'tags', type: 'list', value: ['x', 'y'] }])
    expect(out).toContain('tags:')
    expect(parseFrontmatter(out)[0].value).toEqual(['x', 'y'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- frontmatterModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontmatterModel.ts`**

```typescript
import yaml from 'js-yaml'

export type FmType = 'text' | 'list' | 'checkbox' | 'number' | 'date'

export interface FmField {
  key: string
  type: FmType
  value: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function inferType(value: unknown): FmType {
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string' && DATE_RE.test(value)) return 'date'
  return 'text'
}

/** Extract the YAML body between the leading `---` fences, or null. */
function frontmatterBody(source: string): string | null {
  const lines = source.split('\n')
  if (lines[0] !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return lines.slice(1, i).join('\n')
  }
  return null
}

export function parseFrontmatter(source: string): FmField[] {
  const body = frontmatterBody(source)
  if (body === null) return []
  let data: unknown
  try {
    data = yaml.load(body)
  } catch {
    return []
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    key,
    type: inferType(value),
    value
  }))
}

export function serializeFrontmatter(fields: FmField[]): string {
  const obj: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.key.trim() === '') continue
    obj[f.key] = f.value
  }
  // dump with stable key order (insertion order preserved by js-yaml via sortKeys:false)
  const body = yaml.dump(obj, { sortKeys: false, lineWidth: -1 }).trimEnd()
  return `---\n${body}\n---`
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- frontmatterModel`
Expected: PASS (4 tests). Note: `yaml.load` may parse a bare `YYYY-MM-DD` as a JS `Date`. If `byKey.date.type` is not `'date'`, adjust `inferType` to also treat `value instanceof Date` as `'date'` and add a `Date`→`YYYY-MM-DD` normalization in `serializeFrontmatter`. Update the test expectation for `date.value` accordingly (store the ISO date string in the field, and `yaml.dump` it as a plain string by converting Date → `toISOString().slice(0,10)`).

- [ ] **Step 5: Commit**

```bash
git add test/frontmatterModel.test.ts src/renderer/src/editor/livePreview/frontmatterModel.ts
git commit -m "feat(editor): frontmatter YAML<->fields pure functions"
```

### Task 10: `PropertiesWidget`

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`

- [ ] **Step 1: Append `PropertiesWidget`**

```typescript
import { parseFrontmatter, serializeFrontmatter, type FmField } from './frontmatterModel'

/**
 * Renders frontmatter as an editable Obsidian-style properties panel. Replaces
 * the `---...---` region. Field edits commit on blur/change/compositionend by
 * re-serializing to YAML and dispatching a source replacement.
 */
export class PropertiesWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly view: EditorView
  ) {
    super()
  }

  eq(other: PropertiesWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to
  }

  toDOM(): HTMLElement {
    const fields = parseFrontmatter(this.source)
    const root = document.createElement('div')
    root.className = 'cm-properties'

    const commit = (next: FmField[]): void => {
      const insert = serializeFrontmatter(next)
      if (insert === this.source) return
      this.view.dispatch({ changes: { from: this.from, to: this.to, insert } })
    }

    let composing = false

    const renderRow = (field: FmField, idx: number): HTMLElement => {
      const row = document.createElement('div')
      row.className = 'cm-prop-row'

      const keyEl = document.createElement('input')
      keyEl.className = 'cm-prop-key'
      keyEl.value = field.key
      keyEl.addEventListener('blur', () => {
        if (composing) return
        const next = [...fields]
        next[idx] = { ...field, key: keyEl.value }
        commit(next)
      })

      const valWrap = document.createElement('div')
      valWrap.className = 'cm-prop-val'
      valWrap.appendChild(buildValueControl(field, idx))

      const del = document.createElement('button')
      del.className = 'cm-prop-del'
      del.textContent = '×'
      del.title = 'Delete property'
      del.addEventListener('click', () => {
        const next = fields.filter((_, i) => i !== idx)
        commit(next)
      })

      row.appendChild(keyEl)
      row.appendChild(valWrap)
      row.appendChild(del)
      return row
    }

    const buildValueControl = (field: FmField, idx: number): HTMLElement => {
      const setVal = (value: unknown): void => {
        const next = [...fields]
        next[idx] = { ...field, value }
        commit(next)
      }
      if (field.type === 'checkbox') {
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.checked = Boolean(field.value)
        box.addEventListener('change', () => setVal(box.checked))
        return box
      }
      if (field.type === 'list') {
        const input = document.createElement('input')
        input.className = 'cm-prop-input'
        input.value = (Array.isArray(field.value) ? field.value : []).join(', ')
        input.addEventListener('compositionstart', () => { composing = true })
        input.addEventListener('compositionend', () => {
          composing = false
          setVal(input.value.split(',').map((s) => s.trim()).filter(Boolean))
        })
        input.addEventListener('blur', () => {
          if (composing) return
          setVal(input.value.split(',').map((s) => s.trim()).filter(Boolean))
        })
        return input
      }
      const input = document.createElement('input')
      input.className = 'cm-prop-input'
      input.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
      input.value = field.value == null ? '' : String(field.value)
      input.addEventListener('compositionstart', () => { composing = true })
      const commitText = (): void => {
        if (composing) return
        const raw = input.value
        setVal(field.type === 'number' ? Number(raw) : raw)
      }
      input.addEventListener('compositionend', () => { composing = false; commitText() })
      input.addEventListener('blur', commitText)
      return input
    }

    fields.forEach((f, i) => root.appendChild(renderRow(f, i)))

    const add = document.createElement('button')
    add.className = 'cm-prop-add'
    add.textContent = '+ 添加属性'
    add.addEventListener('click', () => {
      commit([...fields, { key: 'new-property', type: 'text', value: '' }])
    })
    root.appendChild(add)

    return root
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/editor/livePreview/widgets.ts
git commit -m "feat(editor): PropertiesWidget for editable frontmatter"
```

### Task 11: Emit properties spec + render it; add styles; remove old frontmatter lines

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Modify: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Modify: `src/renderer/src/editor/livePreview/theme.ts`

- [ ] **Step 1: Replace the frontmatter spec emission in `decorationSpecs.ts`**

Add `| 'properties'` to `DecoKind`. Replace the existing frontmatter block:

```typescript
  // Frontmatter: render as an editable properties panel when the cursor is
  // outside the block; reveal raw YAML (muted lines) when inside.
  const fmEnd = frontmatterEnd(state)
  if (fmEnd > 0) {
    const fmRevealed = rangeRevealed(state, 0, fmEnd)
    if (!fmRevealed) {
      specs.push({
        kind: 'properties',
        from: 0,
        to: fmEnd,
        revealed: false,
        source: doc.sliceString(0, fmEnd)
      })
    } else {
      for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n)
        if (line.from >= fmEnd) break
        specs.push({ kind: 'frontmatter', from: line.from, to: line.from, revealed: true })
      }
    }
  }
```

Keep the existing iterate-guard (`if (fmEnd > 0 && node.from < fmEnd) return`) so the grammar's bogus hr/setext nodes inside the region stay suppressed in both branches.

- [ ] **Step 2: Render in `livePreviewPlugin.ts`**

Import `PropertiesWidget`:
```typescript
import { CheckboxWidget, HrWidget, CodeBlockWidget, TableWidget, PropertiesWidget } from './widgets'
```
Add case:
```typescript
      case 'properties':
        ranges.push(
          Decoration.replace({
            widget: new PropertiesWidget(s.source ?? '', s.from, s.to, view),
            block: true
          }).range(s.from, s.to)
        )
        break
```
(The existing `frontmatter` case — line decoration — stays for the revealed branch.)

- [ ] **Step 3: Add styles in `theme.ts`**

```typescript
  '.cm-properties': {
    border: '1px solid var(--border-soft)',
    borderRadius: '8px',
    background: 'var(--bg-panel)',
    padding: '8px 10px',
    margin: '4px 0 14px',
    fontSize: '0.9em'
  },
  '.cm-prop-row': {
    display: 'grid',
    gridTemplateColumns: '160px 1fr auto',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0'
  },
  '.cm-prop-key': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: '500',
    padding: '3px 4px',
    borderRadius: '4px'
  },
  '.cm-prop-key:focus': { background: 'var(--bg-elev)', outline: 'none' },
  '.cm-prop-input': {
    width: '100%',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    padding: '3px 6px',
    borderRadius: '4px'
  },
  '.cm-prop-input:focus': { border: '1px solid var(--accent-line)', outline: 'none' },
  '.cm-prop-del': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    opacity: '0',
    fontSize: '1.1em',
    lineHeight: '1'
  },
  '.cm-prop-row:hover .cm-prop-del': { opacity: '1' },
  '.cm-prop-add': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    fontSize: '0.88em',
    padding: '4px',
    marginTop: '2px'
  },
  '.cm-prop-add:hover': { color: 'var(--accent)' },
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: all pass.

- [ ] **Step 5: Visual verify (screenshot)**

`npm run dev`, open a note with frontmatter (title/tags/date/done). Screenshot. Expected: properties card with typed controls; editing a value or adding/deleting a property updates the YAML; clicking into the region reveals raw YAML.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts src/renderer/src/editor/livePreview/livePreviewPlugin.ts src/renderer/src/editor/livePreview/theme.ts
git commit -m "feat(editor): render frontmatter as editable properties panel"
```

---

## Final verification

### Task 12: Full regression + combined screenshot

- [ ] **Step 1: Full typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: all green.

- [ ] **Step 2: Combined visual check**

Create a test note containing frontmatter + headings + a long-line fenced code block + a GFM table. `npm run dev`, screenshot. Verify all four fixes simultaneously: no heading underline, code scrolls+highlights, table renders+editable, properties panel editable. Confirm cursor-reveal works for each block and Chinese input works in table cells and property inputs.

- [ ] **Step 3: Update memory**

If the rich-block widget pattern is worth recording, add a note to `MEMORY.md` per the memory guidance.

---

## Appendix: Screenshot verification

The app is Electron. To capture the running window:

1. Start dev server in background: `npm run dev` (run_in_background).
2. Wait for the Electron window to appear (~3-5s).
3. Capture the frontmost window:
   `screencapture -o -l $(osascript -e 'tell app "System Events" to id of window 1 of (first process whose name is "Electron")') /tmp/margin-shot.png` — if that AppleScript path is unreliable, fall back to `screencapture -o /tmp/margin-shot.png` (full screen) and crop, or `screencapture -ow /tmp/margin-shot.png` (interactive window pick).
4. Read `/tmp/margin-shot.png` with the Read tool to inspect.

Prepare test fixtures under `/tmp` and open them via the app's folder picker, or point the vault at a scratch directory containing a `test.md` with all elements.

---

## Self-Review notes

- **Spec coverage:** ① heading underline → Task 1. ② code scroll+highlight → Tasks 2–4. ③ table inline edit → Tasks 5–7. ④ properties panel → Tasks 8–11. Testing strategy → Tasks 5/9 (unit) + screenshot steps + Task 12. All spec sections covered.
- **Type consistency:** `TableModel`/`Align` used consistently across `tableModel.ts` and `TableWidget`. `FmField`/`FmType` consistent across `frontmatterModel.ts` and `PropertiesWidget`. `buildDecorations(state, view)` signature updated at all call sites in Task 7. `DecoSpec` gains `info`/`source` in Task 4, reused by Tasks 7/11.
- **Reveal consistency:** every block (code/table/properties) emits its widget only when `!revealed`, and falls back to raw/line decorations when revealed — uniform behavior.
