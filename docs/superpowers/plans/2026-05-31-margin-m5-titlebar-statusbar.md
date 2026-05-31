# Margin M5 — Title Bar + Status Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the top header into a proper title bar (breadcrumb `<parent> / <file>` + dirty dot), add a bottom status bar (char/word/minute/block counts + save status), and remove the single-file "Open…" entry so files open only via the sidebar tree.

**Architecture:** A pure `computeStats(markdown)` produces the four counts; a `useDocStats(content)` hook debounces it (200ms) into React state. A presentational `StatusBar` renders the counts + save status at the window bottom. `App.tsx` drops the Open… button and its `openFileDialog` logic, adds a breadcrumb + dirty dot to the header, moves save-status text into the status bar, and mounts `<StatusBar/>` below the editor row. No editor/IPC/document-truth changes.

**Tech Stack:** React 18 + TS, Zustand (existing stores), Vitest + jsdom + @testing-library/react.

---

## Context for the implementer

Work in `/Users/jianjustin/workspaces/margin`, an Electron + React + TS + CodeMirror 6 app. M0–M4 are done and pushed (HEAD `5385910` or later; M5 spec commit `7b2e8f1`). Read the M5 spec first: [docs/superpowers/specs/2026-05-31-margin-m5-titlebar-statusbar-design.md](../specs/2026-05-31-margin-m5-titlebar-statusbar-design.md).

Key facts:
- Node `v20.20.1`. Builds on `main`, no worktree.
- **This Bash environment mangles large/multiline stdout** — for verification, write output to a temp file and Read it; trust the git push refspec line.
- Vitest runs `test/**/*.test.ts` AND `test/**/*.test.tsx` in node; jsdom tests use a `// @vitest-environment jsdom` header. `@testing-library/react` + `@testing-library/dom` are installed; `vitest.config.ts` has `esbuild: { jsx: 'automatic' }`. `@` → `src/renderer/src`.
- Do NOT run `npm run dev` (blocking GUI); verify with `npm run typecheck`, `npx vitest run`, `npm run build`. Controller does GUI acceptance.

### Existing stores you use (do not change their shape)

- `useDocumentStore`: `path: string|null`, `content: string`, `savedContent: string`, `saveStatus: 'saved'|'saving'|'dirty'|'error'`, `isDirty()`. A reactive dirty boolean is `useDocumentStore((s) => s.content !== s.savedContent)`.
- The current `src/renderer/src/App.tsx` (full content) is a two-column shell: header (sidebar toggle, **Open… button**, filename span, save-status span, ThemeToggle) + sidebar/editor row + context menu. The save-status `<span>` lives in the header's `ml-auto` flex div.

### File map after M5

```
src/renderer/src/
├─ lib/computeStats.ts        NEW (pure)
├─ hooks/useDocStats.ts       NEW (debounce 200ms)
├─ components/StatusBar.tsx   NEW
└─ App.tsx                    MOD: remove Open…, add breadcrumb + dirty dot, mount StatusBar
test/
├─ computeStats.test.ts       NEW
└─ statusBar-dom.test.tsx     NEW (jsdom + RTL)
```

### The DocStats contract (Task 1; used by hook + StatusBar)

```ts
export interface DocStats {
  chars: number    // CJK character count
  words: number    // CJK chars + English words
  minutes: number  // reading minutes
  blocks: number   // top-level block count
}
```

---

## Task 1: computeStats pure function (TDD)

**Files:**
- Create: `src/renderer/src/lib/computeStats.ts`
- Test: `test/computeStats.test.ts`

- [ ] **Step 1: Write the failing test**

`test/computeStats.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeStats } from '@/lib/computeStats'

describe('computeStats', () => {
  it('counts CJK characters', () => {
    const s = computeStats('你好世界')
    expect(s.chars).toBe(4)
    expect(s.words).toBe(4)
  })

  it('counts English words (not letters)', () => {
    const s = computeStats('hello world foo')
    expect(s.chars).toBe(0)
    expect(s.words).toBe(3)
  })

  it('mixes CJK chars and English words', () => {
    const s = computeStats('你好 hello world')
    expect(s.chars).toBe(2)
    expect(s.words).toBe(4) // 2 CJK + 2 English
  })

  it('treats hyphenated/apostrophe words as one', () => {
    const s = computeStats("don't well-being")
    expect(s.words).toBe(2)
  })

  it('is all zero for an empty document', () => {
    expect(computeStats('')).toEqual({ chars: 0, words: 0, minutes: 0, blocks: 0 })
  })

  it('minutes is at least 1 when there are words', () => {
    expect(computeStats('hello').minutes).toBe(1)
  })

  it('minutes scales by ~320 words/min', () => {
    const words = Array.from({ length: 640 }, () => 'word').join(' ')
    expect(computeStats(words).minutes).toBe(2)
  })

  it('counts blocks separated by blank lines (non-empty only)', () => {
    const doc = '# Title\n\nFirst paragraph.\n\n\nSecond paragraph.'
    expect(computeStats(doc).blocks).toBe(3)
  })

  it('a single paragraph is one block', () => {
    expect(computeStats('just one line').blocks).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- computeStats`
Expected: FAIL — cannot resolve `@/lib/computeStats`.

- [ ] **Step 3: Implement computeStats.ts**

```ts
export interface DocStats {
  chars: number
  words: number
  minutes: number
  blocks: number
}

const CJK = /[一-鿿぀-ヿ가-힯]/g
const EN_WORD = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g
const WORDS_PER_MIN = 320

/**
 * Lightweight document statistics over raw markdown. CJK characters are counted
 * individually; runs of Latin/alphanumeric (incl. apostrophes/hyphens) count as
 * one word each. Blocks = paragraphs separated by blank lines. Pure & read-only.
 */
export function computeStats(markdown: string): DocStats {
  const chars = (markdown.match(CJK) ?? []).length
  const englishWords = (markdown.match(EN_WORD) ?? []).length
  const words = chars + englishWords
  const minutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MIN)) : 0
  const blocks = markdown
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0).length

  return { chars, words, minutes, blocks }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- computeStats`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/computeStats.ts test/computeStats.test.ts
git commit -m "feat(stats): computeStats pure helper (char/word/minute/block) — TDD"
```

---

## Task 2: useDocStats debounce hook

**Files:**
- Create: `src/renderer/src/hooks/useDocStats.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useState } from 'react'
import { computeStats, type DocStats } from '@/lib/computeStats'

const DEBOUNCE_MS = 200

/**
 * Compute document stats for `content`, debounced so typing doesn't recompute on
 * every keystroke. Returns the latest settled stats.
 */
export function useDocStats(content: string): DocStats {
  const [stats, setStats] = useState<DocStats>(() => computeStats(content))

  useEffect(() => {
    const timer = setTimeout(() => setStats(computeStats(content)), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [content])

  return stats
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck > /tmp/m5t2.txt 2>&1; echo "tc=$?" >> /tmp/m5t2.txt
```
Read `/tmp/m5t2.txt`; expect `tc=0`.
```bash
git add src/renderer/src/hooks/useDocStats.ts
git commit -m "feat(stats): useDocStats debounce hook (200ms)"
```

---

## Task 3: StatusBar component

**Files:**
- Create: `src/renderer/src/components/StatusBar.tsx`

- [ ] **Step 1: Create StatusBar.tsx**

```tsx
import type { DocStats } from '@/lib/computeStats'
import type { SaveStatus } from '@/stores/documentStore'

interface StatusBarProps {
  stats: DocStats
  saveStatus: SaveStatus
  hasFile: boolean
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '保存中…',
  dirty: '未保存',
  error: '保存失败'
}

/** Bottom status bar: counts on the left, block count + save status on the right. */
export function StatusBar({ stats, saveStatus, hasFile }: StatusBarProps): JSX.Element {
  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] px-4 text-[11.5px] text-[color:var(--text-faint)]"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <div className="flex items-center gap-3">
        <span>{stats.chars} 字符</span>
        <span>{stats.words} 词</span>
        <span>约 {stats.minutes} 分钟</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{stats.blocks} 块</span>
        {hasFile && (
          <span className={saveStatus === 'error' ? 'text-[color:var(--red)]' : 'text-[color:var(--accent)]'}>
            {SAVE_LABEL[saveStatus]}
          </span>
        )}
      </div>
    </footer>
  )
}
```

> `SaveStatus` is exported from `documentStore.ts` (it already declares `export type SaveStatus`).
> If it is NOT exported there, add `export` to its `type SaveStatus` declaration as part of this task.

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck > /tmp/m5t3.txt 2>&1; echo "tc=$?" >> /tmp/m5t3.txt
```
Read `/tmp/m5t3.txt`; expect `tc=0`. If it fails because `SaveStatus` isn't exported, add `export` to the `type SaveStatus = ...` line in `src/renderer/src/stores/documentStore.ts`, re-run, then include that file in the commit.
```bash
git add src/renderer/src/components/StatusBar.tsx
git commit -m "feat(stats): StatusBar component (counts + save status)"
```

---

## Task 4: Rewire App — remove Open…, add breadcrumb + dirty dot, mount StatusBar

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Update imports**

In `src/renderer/src/App.tsx`, the import block currently ends with the RowContextMenu + TreeNode imports. Add:
```tsx
import { StatusBar } from '@/components/StatusBar'
import { useDocStats } from '@/hooks/useDocStats'
```

- [ ] **Step 2: Add dirty + stats derivations**

After the existing `const saveStatus = useDocumentStore((s) => s.saveStatus)` line, add:
```tsx
  const dirty = useDocumentStore((s) => s.content !== s.savedContent)
  const stats = useDocStats(content)
```

- [ ] **Step 3: Delete the openFileDialog function**

Remove this entire function (currently lines ~59-63):
```tsx
  async function openFileDialog(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    await openFileByPath(chosen)
  }
```

- [ ] **Step 4: Replace the header JSX**

Replace the entire `<header>…</header>` block with this (drops the Open… button, adds breadcrumb + dirty dot, removes the save-status span — that moves to the StatusBar):
```tsx
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 pl-20 text-sm text-muted-foreground">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="grid h-[26px] w-[30px] place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <PanelLeft size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[12.5px] text-[color:var(--text-dim)]">
          {path ? (
            <>
              {parentName && <span className="text-[color:var(--text-faint)]">{parentName} /</span>}
              <span className="truncate">{fileName}</span>
              <span
                className="h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--accent)] transition-opacity"
                style={{ opacity: dirty ? 1 : 0 }}
                aria-hidden
              />
            </>
          ) : (
            <span className="text-[color:var(--text-faint)]">No file open</span>
          )}
        </div>
        <ThemeToggle />
      </header>
```

- [ ] **Step 5: Compute breadcrumb parts**

Replace the existing `const fileName = path ? path.split('/').pop() : 'No file open'` line with:
```tsx
  const parts = path ? path.split('/') : []
  const fileName = parts.length > 0 ? parts[parts.length - 1] : ''
  const parentName = parts.length > 1 ? parts[parts.length - 2] : ''
```

- [ ] **Step 6: Mount StatusBar at the bottom**

The component returns a `<div className="flex h-screen flex-col …">` containing `<header>`, the `<div className="flex min-h-0 flex-1">…</div>` row, and the `{menu && …}` block. Add `<StatusBar/>` immediately AFTER the sidebar/editor row `</div>` and BEFORE the `{menu && …}` block:
```tsx
      <StatusBar stats={stats} saveStatus={saveStatus} hasFile={path !== null} />
```

- [ ] **Step 7: Typecheck + build**

```bash
npm run typecheck > /tmp/m5t4.txt 2>&1; echo "tc=$?" >> /tmp/m5t4.txt
npm run build >> /tmp/m5t4.txt 2>&1; echo "build=$?" >> /tmp/m5t4.txt
```
Read `/tmp/m5t4.txt`; expect `tc=0`, `build=0`. (If TS flags `openFileByPath` or `openFile` as unused — they are NOT, `openFileByPath` is still used by the sidebar and context menu; `window.margin.openFile` simply has no caller now, which is fine.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(ui): title bar breadcrumb + dirty dot; bottom status bar; drop Open button"
```

---

## Task 5: DOM smoke test for StatusBar

**Files:**
- Test: `test/statusBar-dom.test.tsx`

- [ ] **Step 1: Write the test**

`test/statusBar-dom.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { StatusBar } from '@/components/StatusBar'
import { computeStats } from '@/lib/computeStats'

afterEach(cleanup)

describe('StatusBar', () => {
  it('renders the counts from stats', () => {
    const stats = computeStats('你好 hello world')
    render(<StatusBar stats={stats} saveStatus="saved" hasFile />)
    expect(screen.getByText('2 字符')).toBeTruthy()
    expect(screen.getByText('4 词')).toBeTruthy()
    expect(screen.getByText(/块$/)).toBeTruthy()
  })

  it('shows the save status when a file is open', () => {
    const stats = computeStats('x')
    render(<StatusBar stats={stats} saveStatus="saving" hasFile />)
    expect(screen.getByText('保存中…')).toBeTruthy()
  })

  it('hides the save status when no file is open', () => {
    const stats = computeStats('')
    render(<StatusBar stats={stats} saveStatus="saved" hasFile={false} />)
    expect(screen.queryByText('已保存')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm test -- statusBar-dom`
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/statusBar-dom.test.tsx
git commit -m "test(stats): DOM smoke test for StatusBar"
```

---

## Task 6: Full verification + manual GUI acceptance + push

**Files:** none

- [ ] **Step 1: Headless full check**

```bash
npm run typecheck > /tmp/m5final.txt 2>&1; echo "tc=$?" >> /tmp/m5final.txt
npx vitest run >> /tmp/m5final.txt 2>&1
npm run build >> /tmp/m5final.txt 2>&1; echo "build=$?" >> /tmp/m5final.txt
```
Read `/tmp/m5final.txt`. Expected: `tc=0`, all tests pass (66 prior + 9 computeStats + 3 statusBar = 78), `build=0`.

- [ ] **Step 2: Manual GUI acceptance (controller or user)**

Launch `npm run dev`, open a vault and a note via the sidebar, and verify:
1. The header has NO "Open…" button — only the sidebar toggle (left), breadcrumb `<parent> / <file>` centered, and the theme button (right).
2. The breadcrumb shows the parent folder + file name; a long file name truncates with an ellipsis.
3. Typing makes the dirty dot (gold) appear next to the file name; after autosave it fades out.
4. The bottom status bar shows `<n> 字符 · <n> 词 · 约 <n> 分钟` on the left and `<n> 块` + save status (已保存/保存中…) on the right; counts update ~0.2s after you stop typing.
5. With no file open, the header shows "No file open" and the status bar shows zeros with no save status.

> GUI automation does not work in this environment, so Step 2 is a human/controller eyeball check.

- [ ] **Step 3: Push**

```bash
git push origin main > /tmp/m5push.txt 2>&1; echo "exit=$?" >> /tmp/m5push.txt
```
Read `/tmp/m5push.txt`; expect the `main -> main` refspec line and `exit=0`.

---

## Self-review notes (for the implementer)

- **Spec coverage:** §2 computeStats rules (Task 1) — note minutes is 0 for an empty doc and ≥1 once words>0 (matches spec §2's corrected rule); §3.1 StatusBar (Tasks 3,4,6); §3.2 title-bar breadcrumb + dirty dot + Open… removal + save-status moved to status bar (Task 4); §4 layout + 200ms debounce (Tasks 2,4); §6 tests (Tasks 1,5).
- **No document/IPC changes:** stats are read-only over `content`; the `openFile` IPC channel and its main/preload impl stay (spec §8 non-goal) — only the renderer UI entry is removed.
- **Type consistency:** `DocStats` defined once in `computeStats.ts`, imported by hook + StatusBar; `SaveStatus` imported from `documentStore` (export added in Task 3 if missing); `dirty` derived reactively as `content !== savedContent`.
- **Reuse check:** `openFileByPath` stays (sidebar + context menu use it); only `openFileDialog` is deleted. `fileName` is recomputed as part of the breadcrumb parts.
- **Roadmap:** M5 is the last milestone — after this, M0–M5 of the Margin v2 spec are complete.
