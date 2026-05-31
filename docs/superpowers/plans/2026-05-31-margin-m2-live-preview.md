# Margin v2 — M2 Live-Preview Decoration Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the raw-markdown CodeMirror 6 editor into a Typora-style WYSIWYG view: render markdown inline (hide syntax markers, style the text) while revealing the raw syntax on whatever line/block the cursor is in.

**Architecture:** A pure, unit-tested collector walks the Lezer markdown syntax tree of the current `EditorState` and emits a flat list of `DecoSpec` records (what to hide, what to style, what to replace with a widget), each tagged with whether the cursor currently "reveals" it. A thin `ViewPlugin` (the only DOM-touching piece) maps those specs to a CodeMirror `DecorationSet` and rebuilds it on every doc/selection/viewport change. A separate theme module supplies the CSS for the decoration classes, driven by the existing shadcn CSS variables. The document text in `EditorState.doc` is never mutated — decorations only affect rendering, preserving the lossless-markdown north star.

**Tech Stack:** CodeMirror 6 (`@codemirror/{state,view,language,lang-markdown,language-data}`), Lezer markdown tree via `markdownLanguage`, Vitest.

---

## Context for the implementer

You are working in `/Users/jianjustin/workspaces/margin`, an Electron + React + TypeScript app. M0/M1 are done: there is a working single-file editor at [src/renderer/src/components/Editor.tsx](../../../src/renderer/src/components/Editor.tsx) that currently shows raw markdown with line numbers and no styling. Read the design spec §6 first: [docs/superpowers/specs/2026-05-31-margin-wysiwyg-editor-design.md](../specs/2026-05-31-margin-wysiwyg-editor-design.md).

Key facts:
- Node `v20.20.1`, npm `10.x`. The project builds directly on `main` by design (user-approved) — no worktree.
- Vitest is configured (`vitest.config.ts`) to run `test/**/*.test.ts` in the **node** environment, with `@` aliased to `src/renderer/src`. CodeMirror packages are pure ESM and an `EditorState` can be created in node with no DOM — so the collector and reveal logic are fully unit-testable. **Anything that constructs an `EditorView` or a widget's DOM needs a browser and is verified by running the app, not by unit tests.**
- The markdown source of truth lives in the editor's `EditorState.doc`. M2 must NOT change the document text; it only adds rendering decorations.
- `markdownLanguage` (from `@codemirror/lang-markdown`) is the GFM-enabled grammar — it produces `Strikethrough`/`StrikethroughMark`, `Task`/`TaskMarker`, `Table`, etc. Use it as the parser base. Do **not** also import a separate `GFM` extension (it would double-register).
- `@codemirror/language-data` is NOT yet installed (Task 1 installs it). It provides `languages`, a registry of lazy-loaded language packages for fenced-code highlighting.

### Lezer markdown node names you will rely on (verified against the installed grammar)

- Headings: `ATXHeading1` … `ATXHeading6`; the leading `#`s are a child `HeaderMark`.
- Bold: `StrongEmphasis`; markers are child `EmphasisMark` (`**`/`__`).
- Italic: `Emphasis`; markers are child `EmphasisMark` (`*`/`_`).
- Strikethrough: `Strikethrough`; markers are child `StrikethroughMark` (`~~`).
- Inline code: `InlineCode`; the backticks are child `CodeMark`.
- Fenced code: `FencedCode`; the ``` fences are child `CodeMark`, the language string is child `CodeInfo`.
- Blockquote: `Blockquote`; the `>` markers are child `QuoteMark`.
- Horizontal rule: `HorizontalRule` (spans the whole line, e.g. `---`).
- Task list checkbox: `TaskMarker` (the `[ ]` / `[x]` token).
- Link: `Link`; its children include `LinkMark` (`[`, `]`, `(`, `)`) and `URL`. (Images are a separate `Image` node — we deliberately do not touch it, so images render as raw source per spec §6.4.)

### File layout after M2

```
src/renderer/src/editor/
└─ livePreview/
   ├─ reveal.ts             pure: rangeRevealed(state, from, to) — cursor-aware reveal test
   ├─ decorationSpecs.ts    pure: DecoKind/DecoSpec types + collectDecorations(state): DecoSpec[]
   ├─ widgets.ts            CheckboxWidget + HrWidget (WidgetType subclasses; DOM at render time)
   ├─ livePreviewPlugin.ts  ViewPlugin: DecoSpec[] → DecorationSet (the only stateful/DOM glue)
   └─ theme.ts              marginEditorTheme: EditorView.theme for the decoration classes
src/renderer/src/components/Editor.tsx   modified: GFM base + codeLanguages + syntaxHighlighting + livePreview + theme; drop line numbers
test/
├─ reveal.test.ts
├─ decorationSpecs-inline.test.ts
└─ decorationSpecs-block.test.ts
```

### The `DecoSpec` contract (defined in Task 2, used everywhere after)

```ts
export type DecoKind =
  | 'hide'         // replace a marker range with nothing — gated by `revealed`
  | 'headingLine'  // line decoration: cm-heading cm-h{level} — always applied
  | 'bold'         // mark decoration: cm-strong — always applied
  | 'italic'       // mark decoration: cm-em — always applied
  | 'strike'       // mark decoration: cm-strike — always applied
  | 'inlineCode'   // mark decoration: cm-inline-code — always applied
  | 'quoteLine'    // line decoration: cm-blockquote — always applied
  | 'codeLine'     // line decoration: cm-code-block — always applied
  | 'link'         // mark decoration: cm-link — always applied
  | 'hr'           // replace whole line with <hr> widget — gated by `revealed`
  | 'task'         // replace [ ]/[x] with checkbox widget — gated by `revealed`

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean   // meaningful only for the gated kinds: 'hide', 'hr', 'task'
  level?: number      // 1-6, only for 'headingLine'
  checked?: boolean   // only for 'task'
}
```

Rule of thumb used by the plugin: **styling kinds are always rendered; gated kinds (`hide`/`hr`/`task`) are rendered only when `revealed === false`.** Line decorations use a point range at the line start (`from === to === line.from`).

### Explicit M2 non-goals (do NOT build these)

- `atomicRanges` to make the cursor skip hidden markers (cursor-aware reveal already makes hidden zones reachable). Note it as a future nicety; don't implement.
- Hiding bullet/number list markers (Obsidian Live Preview keeps them visible; only task checkboxes are widgetized).
- Tables and images get no decorations — they render as raw markdown source (spec §6.4). This is achieved by simply not emitting specs for them.
- Exact Bear oklch palette / IBM Plex fonts (that's M3). M2 styles use the existing shadcn CSS vars (`--primary`, `--muted`, `--border`, `--muted-foreground`) so it already looks roughly on-brand.

---

## Task 1: Install language-data + cursor-aware reveal helper

**Files:**
- Modify: `package.json` (add `@codemirror/language-data`)
- Create: `src/renderer/src/editor/livePreview/reveal.ts`
- Test: `test/reveal.test.ts`

- [ ] **Step 1: Install the language-data registry**

Run:
```bash
npm install @codemirror/language-data@^6.5.1
```
Expected: installs, `package.json` dependencies now include `@codemirror/language-data`, no errors.

- [ ] **Step 2: Write the failing test**

Create `test/reveal.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { rangeRevealed } from '@/editor/livePreview/reveal'

function stateWith(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({ doc, selection: { anchor, head } })
}

describe('rangeRevealed', () => {
  // doc: "# Title\n\nbody" — line 1 is the heading (offsets 0-7)
  const doc = '# Title\n\nbody'

  it('reveals a range when the cursor is on the same line', () => {
    const state = stateWith(doc, 3) // cursor inside "# Title"
    expect(rangeRevealed(state, 0, 1)).toBe(true) // the "#" marker
  })

  it('hides a range when the cursor is on a different line', () => {
    const state = stateWith(doc, 10) // cursor inside "body"
    expect(rangeRevealed(state, 0, 1)).toBe(false)
  })

  it('reveals when a selection spans into the range\'s line', () => {
    const state = stateWith(doc, 10, 2) // selection from "body" back into heading line
    expect(rangeRevealed(state, 0, 1)).toBe(true)
  })

  it('reveals a multi-line block when the cursor is on any of its lines', () => {
    // treat [0, 12] as a block spanning all lines; cursor in "body"
    const state = stateWith(doc, 10)
    expect(rangeRevealed(state, 0, doc.length)).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- reveal`
Expected: FAIL — cannot resolve `@/editor/livePreview/reveal`.

- [ ] **Step 4: Implement reveal.ts**

Create `src/renderer/src/editor/livePreview/reveal.ts`:
```ts
import type { EditorState } from '@codemirror/state'

/**
 * True if any selection range touches the line span containing [from, to].
 * Used to "reveal" raw markdown syntax on the line/block the cursor is in.
 */
export function rangeRevealed(state: EditorState, from: number, to: number): boolean {
  const lineFrom = state.doc.lineAt(from).from
  const lineTo = state.doc.lineAt(to).to
  for (const range of state.selection.ranges) {
    if (range.to >= lineFrom && range.from <= lineTo) return true
  }
  return false
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- reveal`
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/renderer/src/editor/livePreview/reveal.ts test/reveal.test.ts
git commit -m "feat(editor): cursor-aware reveal helper + language-data dep"
```

---

## Task 2: Decoration collector — headings + inline marks

**Files:**
- Create: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Test: `test/decorationSpecs-inline.test.ts`

This task defines the `DecoSpec` contract and implements `collectDecorations` for: ATX headings (hide `#` + size the line), bold, italic, strikethrough, inline code (style the span + hide its markers). Block elements come in Task 3.

- [ ] **Step 1: Write the failing test**

Create `test/decorationSpecs-inline.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

function text(doc: string, s: DecoSpec): string {
  return doc.slice(s.from, s.to)
}

describe('collectDecorations — inline', () => {
  it('emits a heading line deco with the right level and hides the marker', () => {
    const doc = '# Title\n\nbody'
    const specs = collectDecorations(stateWith(doc, 10)) // cursor in "body"
    expect(specs.some((s) => s.kind === 'headingLine' && s.level === 1)).toBe(true)
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).startsWith('#'))
    expect(hide).toBeTruthy()
    expect(hide!.revealed).toBe(false)
    // the hidden marker also swallows the trailing space after '#'
    expect(text(doc, hide!)).toBe('# ')
  })

  it('reveals the heading marker when the cursor is on the heading line', () => {
    const doc = '# Title\n\nbody'
    const specs = collectDecorations(stateWith(doc, 3)) // cursor in "# Title"
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).startsWith('#'))
    expect(hide!.revealed).toBe(true)
  })

  it('styles bold and hides its ** markers', () => {
    const doc = 'a **bold** b'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'bold')).toBe(true)
    const hides = specs.filter((s) => s.kind === 'hide' && text(doc, s) === '**')
    expect(hides.length).toBe(2)
  })

  it('styles italic and strikethrough', () => {
    const doc = 'x *i* y ~~s~~ z'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'italic')).toBe(true)
    expect(specs.some((s) => s.kind === 'strike')).toBe(true)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '*').length).toBe(2)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '~~').length).toBe(2)
  })

  it('styles inline code and hides its backticks', () => {
    const doc = 'call `fn()` now'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'inlineCode')).toBe(true)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '`').length).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- decorationSpecs-inline`
Expected: FAIL — cannot resolve `@/editor/livePreview/decorationSpecs`.

- [ ] **Step 3: Implement decorationSpecs.ts (inline subset)**

Create `src/renderer/src/editor/livePreview/decorationSpecs.ts`:
```ts
import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { rangeRevealed } from './reveal'

export type DecoKind =
  | 'hide'
  | 'headingLine'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'quoteLine'
  | 'codeLine'
  | 'link'
  | 'hr'
  | 'task'

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean
  level?: number
  checked?: boolean
}

/**
 * Walk the markdown syntax tree of `state` and emit a flat list of decoration
 * specs. Pure: depends only on the document text, syntax tree, and selection.
 * Never mutates the document.
 */
export function collectDecorations(state: EditorState): DecoSpec[] {
  const specs: DecoSpec[] = []
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state)
  const doc = state.doc

  const pushHide = (from: number, to: number): void => {
    specs.push({ kind: 'hide', from, to, revealed: rangeRevealed(state, from, to) })
  }

  tree.iterate({
    enter: (node) => {
      const name = node.name

      // Headings: ATXHeading1..6
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = Number(name.slice(-1))
        const line = doc.lineAt(node.from)
        specs.push({ kind: 'headingLine', from: line.from, to: line.from, revealed: false, level })
        return
      }
      if (name === 'HeaderMark') {
        // also swallow the single space after the leading '#'s
        let to = node.to
        if (doc.sliceString(to, to + 1) === ' ') to += 1
        pushHide(node.from, to)
        return
      }

      // Inline emphasis
      if (name === 'StrongEmphasis') {
        specs.push({ kind: 'bold', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'Emphasis') {
        specs.push({ kind: 'italic', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'Strikethrough') {
        specs.push({ kind: 'strike', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
        pushHide(node.from, node.to)
        return
      }

      // Inline code
      if (name === 'InlineCode') {
        specs.push({ kind: 'inlineCode', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'CodeMark') {
        pushHide(node.from, node.to)
        return
      }
    }
  })

  return specs
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- decorationSpecs-inline`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts test/decorationSpecs-inline.test.ts
git commit -m "feat(editor): live-preview decoration collector — headings + inline marks"
```

---

## Task 3: Decoration collector — block elements (quote, fenced code, hr, task, link)

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`
- Test: `test/decorationSpecs-block.test.ts`

Extend `collectDecorations` with: blockquote (line style + hide `>`), fenced code (line style + hide fences/lang), horizontal rule (replace with widget), task checkbox (replace with widget), and links (style label + hide `[`/`]`/`(url)`).

- [ ] **Step 1: Write the failing test**

Create `test/decorationSpecs-block.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}
function text(doc: string, s: DecoSpec): string {
  return doc.slice(s.from, s.to)
}

describe('collectDecorations — blocks', () => {
  it('styles a blockquote line and hides the > marker', () => {
    const doc = '> quoted\n\nbody'
    const specs = collectDecorations(stateWith(doc, 11)) // cursor in "body"
    expect(specs.some((s) => s.kind === 'quoteLine')).toBe(true)
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).includes('>'))
    expect(hide).toBeTruthy()
    expect(hide!.revealed).toBe(false)
  })

  it('styles every line of a fenced code block and hides the fences', () => {
    const doc = '```js\nconst x = 1\n```\n\nbody'
    const specs = collectDecorations(stateWith(doc, doc.length - 1)) // cursor in "body"
    const codeLines = specs.filter((s) => s.kind === 'codeLine')
    expect(codeLines.length).toBeGreaterThanOrEqual(3) // fence, code, fence
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s).includes('```'))).toBe(true)
  })

  it('replaces a horizontal rule with a gated hr spec', () => {
    const doc = 'a\n\n---\n\nb'
    const specs = collectDecorations(stateWith(doc, 0)) // cursor on line "a"
    const hr = specs.find((s) => s.kind === 'hr')
    expect(hr).toBeTruthy()
    expect(hr!.revealed).toBe(false)
    expect(text(doc, hr!)).toBe('---')
  })

  it('emits a task spec with checked state', () => {
    const doc = '- [x] done\n- [ ] todo'
    const specs = collectDecorations(stateWith(doc, doc.length)) // cursor on "todo" line
    const checked = specs.find((s) => s.kind === 'task' && s.checked === true)
    const unchecked = specs.find((s) => s.kind === 'task' && s.checked === false)
    expect(checked).toBeTruthy()
    expect(unchecked).toBeTruthy()
    // cursor is on the second line, so the first task is hidden (revealed=false)
    expect(checked!.revealed).toBe(false)
  })

  it('styles a link and hides its [] and (url) but leaves the label', () => {
    const doc = 'see [docs](http://x.io) here'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'link')).toBe(true)
    // brackets and the url+parens are hidden
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s) === '[')).toBe(true)
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s) === ']')).toBe(true)
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s).includes('http://x.io'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- decorationSpecs-block`
Expected: FAIL — the new block kinds (`quoteLine`, `codeLine`, `hr`, `task`, `link`) are not emitted yet, so these assertions fail.

- [ ] **Step 3: Add the block-handling code to decorationSpecs.ts**

In `src/renderer/src/editor/livePreview/decorationSpecs.ts`, add this helper just **above** the `export function collectDecorations` declaration:
```ts
/** Push a point spec at the start of every line in [from, to]. */
function eachLine(
  state: EditorState,
  from: number,
  to: number,
  make: (lineFrom: number) => DecoSpec
): DecoSpec[] {
  const out: DecoSpec[] = []
  let pos = from
  while (pos <= to) {
    const line = state.doc.lineAt(pos)
    out.push(make(line.from))
    if (line.to >= to) break
    pos = line.to + 1
  }
  return out
}
```

Then, inside the `tree.iterate({ enter: (node) => { ... } })` callback, add these branches **before** the final closing of the callback (after the inline-code block from Task 2):
```ts
      // Blockquote
      if (name === 'Blockquote') {
        for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
          kind: 'quoteLine',
          from: lineFrom,
          to: lineFrom,
          revealed: false
        }))) {
          specs.push(s)
        }
        return
      }
      if (name === 'QuoteMark') {
        pushHide(node.from, node.to)
        return
      }

      // Fenced code
      if (name === 'FencedCode') {
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
      if (name === 'CodeInfo') {
        pushHide(node.from, node.to)
        return
      }

      // Horizontal rule
      if (name === 'HorizontalRule') {
        const line = doc.lineAt(node.from)
        specs.push({
          kind: 'hr',
          from: line.from,
          to: line.to,
          revealed: rangeRevealed(state, line.from, line.to)
        })
        return
      }

      // Task checkbox
      if (name === 'TaskMarker') {
        const raw = doc.sliceString(node.from, node.to)
        specs.push({
          kind: 'task',
          from: node.from,
          to: node.to,
          revealed: rangeRevealed(state, node.from, node.to),
          checked: /\[[xX]\]/.test(raw)
        })
        return
      }

      // Links: style the whole node, hide its [] and (url) children.
      // (Images are a separate `Image` node and are intentionally left untouched.)
      if (name === 'Link') {
        specs.push({ kind: 'link', from: node.from, to: node.to, revealed: false })
        const linkRevealed = rangeRevealed(state, node.from, node.to)
        let child = node.node.firstChild
        while (child) {
          if (child.name === 'LinkMark' || child.name === 'URL') {
            specs.push({ kind: 'hide', from: child.from, to: child.to, revealed: linkRevealed })
          }
          child = child.nextSibling
        }
        return
      }
```

> Note: `CodeMark` is already hidden by the Task 2 branch, which covers both inline-code backticks and fenced-code ``` fences — so fenced fences are hidden without an extra branch. The `Link`-specific hide loop avoids hiding `URL` nodes that belong to images.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- decorationSpecs-block`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: every test passes (reveal, inline, block, plus the M1 documentStore tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/editor/livePreview/decorationSpecs.ts test/decorationSpecs-block.test.ts
git commit -m "feat(editor): live-preview collector — quote/code/hr/task/link blocks"
```

---

## Task 4: Widgets (checkbox + hr)

**Files:**
- Create: `src/renderer/src/editor/livePreview/widgets.ts`

These are `WidgetType` subclasses whose DOM is built at render time, so they are not unit-tested here (no DOM in the node test env) — they are exercised in the Task 7 GUI verification. This task just creates the file; it compiles via the Task 6 typecheck.

- [ ] **Step 1: Create widgets.ts**

```ts
import { WidgetType } from '@codemirror/view'

/** Renders a task-list checkbox replacing the raw `[ ]` / `[x]` token. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task-checkbox'
    // Read-only rendering in M2: toggling is a later milestone.
    box.disabled = true
    return box
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Renders an <hr> replacing a `---` / `***` horizontal-rule line. */
export class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    return hr
  }

  ignoreEvent(): boolean {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/editor/livePreview/widgets.ts
git commit -m "feat(editor): checkbox + hr widgets for live preview"
```

---

## Task 5: Theme (CSS for decoration classes)

**Files:**
- Create: `src/renderer/src/editor/livePreview/theme.ts`

Maps the decoration class names to styles, using the existing shadcn CSS variables so it already looks roughly on-brand (the exact Bear palette is M3).

- [ ] **Step 1: Create theme.ts**

```ts
import { EditorView } from '@codemirror/view'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Visual styling for the live-preview decoration classes. */
export const marginEditorTheme = EditorView.theme({
  '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
  '.cm-h1': { fontSize: '1.62em' },
  '.cm-h2': { fontSize: '1.32em' },
  '.cm-h3': { fontSize: '1.1em' },
  '.cm-h4': { fontSize: '1em' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'hsl(var(--muted-foreground))' },

  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))',
    padding: '0.1em 0.3em',
    borderRadius: '4px'
  },

  '.cm-blockquote': {
    borderLeft: '3px solid hsl(var(--primary))',
    paddingLeft: '0.8em',
    color: 'hsl(var(--muted-foreground))'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))'
  },

  '.cm-link': { color: 'hsl(var(--primary))', textDecoration: 'underline', cursor: 'pointer' },

  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid hsl(var(--border))',
    margin: '0.4em 0'
  },

  '.cm-task-checkbox': { marginRight: '0.4em', verticalAlign: 'middle' }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/editor/livePreview/theme.ts
git commit -m "feat(editor): live-preview theme using shadcn css vars"
```

---

## Task 6: ViewPlugin + wire into Editor

**Files:**
- Create: `src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Modify: `src/renderer/src/components/Editor.tsx`

The plugin turns `DecoSpec[]` into a CodeMirror `DecorationSet` and rebuilds on every relevant update. Then the Editor enables GFM parsing, fenced-code language highlighting, markdown syntax highlighting, the live-preview plugin, and the theme — and drops line numbers for the clean Typora look.

- [ ] **Step 1: Create livePreviewPlugin.ts**

```ts
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { collectDecorations } from './decorationSpecs'
import { CheckboxWidget, HrWidget } from './widgets'

const hideMark = Decoration.replace({})
const boldMark = Decoration.mark({ class: 'cm-strong' })
const italicMark = Decoration.mark({ class: 'cm-em' })
const strikeMark = Decoration.mark({ class: 'cm-strike' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code' })
const linkMark = Decoration.mark({ class: 'cm-link' })
const quoteLine = Decoration.line({ class: 'cm-blockquote' })
const codeLine = Decoration.line({ class: 'cm-code-block' })

function buildDecorations(state: EditorState): DecorationSet {
  const specs = collectDecorations(state)
  const ranges = []

  for (const s of specs) {
    switch (s.kind) {
      case 'hide':
        if (!s.revealed && s.to > s.from) ranges.push(hideMark.range(s.from, s.to))
        break
      case 'headingLine':
        ranges.push(
          Decoration.line({ class: `cm-heading cm-h${s.level ?? 1}` }).range(s.from)
        )
        break
      case 'bold':
        ranges.push(boldMark.range(s.from, s.to))
        break
      case 'italic':
        ranges.push(italicMark.range(s.from, s.to))
        break
      case 'strike':
        ranges.push(strikeMark.range(s.from, s.to))
        break
      case 'inlineCode':
        ranges.push(inlineCodeMark.range(s.from, s.to))
        break
      case 'link':
        ranges.push(linkMark.range(s.from, s.to))
        break
      case 'quoteLine':
        ranges.push(quoteLine.range(s.from))
        break
      case 'codeLine':
        ranges.push(codeLine.range(s.from))
        break
      case 'hr':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({ widget: new HrWidget(), block: false }).range(s.from, s.to)
          )
        }
        break
      case 'task':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({ widget: new CheckboxWidget(s.checked ?? false) }).range(
              s.from,
              s.to
            )
          )
        }
        break
    }
  }

  // sort=true lets CodeMirror order the mixed point/range decorations correctly.
  return Decoration.set(ranges, true)
}

/** The live-preview decoration layer: rebuilds on doc/selection/viewport change. */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)
```

- [ ] **Step 2: Update Editor.tsx imports**

In `src/renderer/src/components/Editor.tsx`, replace the import block (lines 1-5):
```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
```
with:
```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { marginEditorTheme } from '@/editor/livePreview/theme'
```

- [ ] **Step 3: Update the extensions array**

In the same file, replace the `extensions` array (currently lines 45-62, the array passed to `EditorState.create`) with:
```tsx
      extensions: [
        history(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreview,
        marginEditorTheme,
        EditorView.lineWrapping,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '16px' },
          '.cm-content': {
            maxWidth: '720px',
            margin: '0 auto',
            padding: '56px 40px',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
          }
        })
      ]
```

> What changed: dropped `lineNumbers()` (clean Typora look), switched `markdown()` → `markdown({ base: markdownLanguage, codeLanguages: languages })` for GFM + fenced-code highlighting, added `syntaxHighlighting`, `livePreview`, and `marginEditorTheme`, and moved the content font from monospace to a sans stack (prose, not code). The `lineNumbers` import was removed in Step 2.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `ranges` in `buildDecorations` triggers an implicit-any error, type it as `import('@codemirror/state').Range<import('@codemirror/view').Decoration>[]` — but `Decoration.set` accepts the inferred array, so this usually passes clean.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds (the renderer bundle grows because `@codemirror/language-data` adds language loaders; a chunk-size warning is expected and fine).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/editor/livePreview/livePreviewPlugin.ts src/renderer/src/components/Editor.tsx
git commit -m "feat(editor): wire live-preview plugin + GFM + code highlighting into editor"
```

---

## Task 7: Manual GUI verification of the WYSIWYG loop

**Files:** none (manual verification)

- [ ] **Step 1: Create a rich scratch Markdown file**

Run:
```bash
cat > /tmp/margin-m2.md <<'EOF'
# Heading One

Some **bold**, *italic*, ~~struck~~, and `inline code` text.

> A blockquote line.

- [x] done task
- [ ] pending task

A [link](https://example.com) in a sentence.

---

```js
const x = 1
console.log(x)
```
EOF
```

- [ ] **Step 2: Launch the app**

Run: `npm run dev`

- [ ] **Step 3: Open the file and verify rendered (non-cursor) state**

Click **Open…**, choose `/tmp/margin-m2.md`. With the cursor parked on a blank/other line, verify:
- The `#` is hidden and "Heading One" is large/bold.
- `**bold**` shows as **bold** with no asterisks; italic and strikethrough likewise.
- `inline code` has a monospace pill background, no backticks.
- The blockquote line has a left bar and muted text, no `>`.
- The two task lines show real checkboxes (first checked, second empty), no `[ ]`/`[x]`.
- The link shows "link" colored/underlined, no `[...](...)`.
- The `---` renders as a horizontal line.
- The JS code block has a panel background and colored syntax, fences hidden.

- [ ] **Step 4: Verify cursor-aware reveal**

Click into the heading line → the raw `# Heading One` reappears. Click into the `**bold**` word → the `**` markers reappear on that line. Click inside the code block → the ``` fences reappear. Move the cursor away → it renders again. Confirm there is no cursor jumping or flicker while typing.

- [ ] **Step 5: Verify lossless round-trip**

Type a word into a paragraph, wait for autosave (~0.8s), then in a separate terminal:
```bash
cat /tmp/margin-m2.md
```
Expected: the file still contains literal markdown (`#`, `**`, ```` ``` ````, `- [ ]`, etc.) plus your edit — decorations did not leak into the saved text. Then quit the app.

- [ ] **Step 6: Final checks and confirmation**

Run:
```bash
npm run typecheck && npm test && npm run build
```
Expected: typecheck clean, all tests pass, build succeeds. M2 is complete.

---

## Self-review notes (for the implementer)

- **Spec coverage (spec §6):** §6.1 decoration-driven approach over the Lezer tree (Tasks 2-3, 6); §6.2 decoration types — replace/hide (`hide`), mark (`bold`/`italic`/`strike`/`inlineCode`/`link`), line (`quoteLine`/`codeLine`/`headingLine`), widget (`hr`/`task`) — all present; §6.3 cursor-aware reveal at line granularity for inline and block granularity for fenced code/hr/task (`reveal.ts`, Task 1, used throughout); §6.4 v1 coverage set (headings, bold, italic, strike, inline code, link, lists, quote, fenced code, hr) all covered, with tables/images deliberately left as raw source; §6.5 fenced-code language highlighting via `codeLanguages: languages` (Task 6).
- **Source-of-truth invariant:** no task mutates `EditorState.doc`; decorations are render-only, so the markdown round-trips losslessly (verified in Task 7 Step 5).
- **Testability split:** pure logic (`reveal`, `collectDecorations`) is TDD-unit-tested in node; DOM-dependent pieces (widgets, ViewPlugin, theme) are verified by running the app in Task 7 — there is no way to unit-test `toDOM`/`EditorView` in the node test env.
- **Deferred (noted, not built):** `atomicRanges` for cursor skip-over; interactive checkbox toggling; bullet/number marker hiding; exact Bear palette + IBM Plex (M3).
- **Known follow-ups from the M1 review still open** (autosave concurrency guard + IPC error handling) are tracked separately and are out of scope for M2.
