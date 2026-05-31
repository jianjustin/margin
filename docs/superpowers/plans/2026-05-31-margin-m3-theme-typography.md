# Margin M3 — Bear Theme + IBM Plex + Follow-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scaffold's rough shadcn dark theme with the mockup's exact Bear warm-gold oklch palette (dark + light), bundle IBM Plex for Latin text (Chinese via system PingFang SC), apply 720pt/1.72 typography, and add a tri-state auto/light/dark theme toggle that follows macOS by default.

**Architecture:** A single `tokens.css` holds the semantic oklch tokens (`--bg`, `--accent`, `--text`, …) as the source of truth, with shadcn's variable names (`--background`, `--primary`, …) mapped onto them; Tailwind reads the tokens directly (no `hsl()` wrapper). Dark is the `:root` default; light is `[data-theme="light"]`. A pure `resolveTheme(mode, systemDark)` plus a Zustand `themeStore` (localStorage-persisted) and a `matchMedia` hook decide which `data-theme` to set on `<html>`. CodeMirror's theme and any shadcn component share the same tokens, so a theme switch is just a CSS-variable cascade — no editor rebuild.

**Tech Stack:** CSS custom properties (oklch), Tailwind 3, @fontsource IBM Plex (sans/mono/serif), Zustand, `window.matchMedia`, Vitest + jsdom.

---

## Context for the implementer

Work in `/Users/jianjustin/workspaces/margin`, an Electron + React + TS + CodeMirror 6 app. M0–M2 are done and pushed. Read the M3 spec first: [docs/superpowers/specs/2026-05-31-margin-m3-theme-typography-design.md](../specs/2026-05-31-margin-m3-theme-typography-design.md).

Key facts:
- Node `v20.20.1`, npm `10.x`. Builds directly on `main` (approved); no worktree.
- Vitest runs `test/**/*.test.ts` in node, `@` → `src/renderer/src`. DOM-dependent tests use a `// @vitest-environment jsdom` header (jsdom is already installed).
- **This Bash environment mangles large/multiline stdout** — for load-bearing checks write to a temp file and Read it, and trust the git push refspec line.
- `@fontsource/ibm-plex-sans@5.2.6`, `-mono@5.2.6`, `-serif@5.2.5` exist. **`@fontsource/ibm-plex-sans-sc` does NOT exist** — Chinese is served by system PingFang SC via the font stack, do not try to install it.
- Current relevant files:
  - `src/renderer/src/index.css` — hand-filled shadcn HSL light/dark vars + body base.
  - `tailwind.config.js` — colors as `hsl(var(--x))` (must become `var(--x)`).
  - `src/renderer/src/editor/livePreview/theme.ts` — CM6 theme using `hsl(var(--primary))` etc., marked `{ dark: true }`.
  - `src/renderer/src/components/Editor.tsx` — sets `.cm-content` font to a system sans stack inline; 720pt maxWidth + 56/40 padding already present.
  - `src/renderer/src/main.tsx` — React entry, imports `./index.css`.
  - `src/renderer/src/App.tsx` — header has only an "Open…" button + filename + save status.
  - `src/renderer/index.html` — CSP `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`.
  - `src/renderer/src/stores/documentStore.ts` — existing Zustand store, follow its style for `themeStore`.

### Exact oklch palette (from `docs/design/margin/project/margin.css`)

Dark (`:root`): bg `0.165 0.006 70`, bg-panel `0.205 0.006 70`, bg-elev `0.245 0.007 70`, bg-hover `0.275 0.008 70`, border `0.305 0.006 70`, border-soft `0.255 0.006 70`, text `0.905 0.01 85`, text-dim `0.66 0.01 80`, text-faint `0.49 0.01 80`, accent `0.82 0.11 90`, accent-ink `0.30 0.05 80`, accent-soft `0.82 0.11 90 / 0.14`, accent-line `0.82 0.11 90 / 0.32`, sel `0.82 0.11 90 / 0.20`, red `0.62 0.18 25`.

Light (`[data-theme="light"]`): bg `0.975 0.005 85`, bg-panel `0.945 0.007 85`, bg-elev `0.995 0.003 85`, bg-hover `0.915 0.009 85`, border `0.875 0.008 85`, border-soft `0.915 0.007 85`, text `0.265 0.012 75`, text-dim `0.46 0.012 75`, text-faint `0.64 0.012 75`, accent `0.60 0.12 70`, accent-ink `0.99 0.02 90`, accent-soft `0.60 0.12 70 / 0.12`, accent-line `0.60 0.12 70 / 0.30`, sel `0.60 0.12 70 / 0.18`.

### File map after M3

```
src/renderer/src/
├─ theme/
│  ├─ tokens.css          NEW: oklch tokens (dark :root + light [data-theme]) + font stacks + shadcn mapping
│  └─ fonts.ts            NEW: @fontsource imports
├─ stores/themeStore.ts   NEW: ThemeMode state + persistence + resolveTheme()
├─ hooks/useSystemTheme.ts NEW: matchMedia → systemDark
├─ components/ThemeToggle.tsx NEW: cycle button (icon per mode)
├─ index.css              MOD: drop hand-filled HSL, import tokens.css, body font
├─ main.tsx               MOD: import fonts
├─ App.tsx                MOD: theme effect (set data-theme) + ThemeToggle in header
└─ editor/livePreview/theme.ts MOD: hsl(var(--x)) → semantic oklch tokens; drop { dark: true }
tailwind.config.js        MOD: hsl(var(--x)) → var(--x)
index.html               MOD: CSP + font-src
package.json             MOD: 3 @fontsource deps
test/
├─ resolveTheme.test.ts   NEW
├─ themeStore.test.ts     NEW
└─ theme-dom.test.ts      NEW (jsdom)
```

---

# Milestone M3a — Bear oklch palette

## Task 1: Create tokens.css and wire it in

**Files:**
- Create: `src/renderer/src/theme/tokens.css`
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Create tokens.css**

```css
/* Semantic Bear palette — single source of truth (oklch). Dark is default. */
:root {
  --bg: oklch(0.165 0.006 70);
  --bg-panel: oklch(0.205 0.006 70);
  --bg-elev: oklch(0.245 0.007 70);
  --bg-hover: oklch(0.275 0.008 70);
  --border: oklch(0.305 0.006 70);
  --border-soft: oklch(0.255 0.006 70);
  --text: oklch(0.905 0.01 85);
  --text-dim: oklch(0.66 0.01 80);
  --text-faint: oklch(0.49 0.01 80);
  --accent: oklch(0.82 0.11 90);
  --accent-ink: oklch(0.3 0.05 80);
  --accent-soft: oklch(0.82 0.11 90 / 0.14);
  --accent-line: oklch(0.82 0.11 90 / 0.32);
  --sel: oklch(0.82 0.11 90 / 0.2);
  --red: oklch(0.62 0.18 25);

  /* Font stacks: Latin from bundled IBM Plex; CJK from system PingFang SC. */
  --ui: 'IBM Plex Sans', 'PingFang SC', system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --serif: 'IBM Plex Serif', Georgia, serif;

  --radius: 0.5rem;

  /* shadcn variable names mapped onto the semantic tokens (so shadcn
     components and Tailwind utilities resolve to the Bear palette). */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--bg-panel);
  --card-foreground: var(--text);
  --popover: var(--bg-panel);
  --popover-foreground: var(--text);
  --primary: var(--accent);
  --primary-foreground: var(--accent-ink);
  --secondary: var(--bg-elev);
  --secondary-foreground: var(--text);
  --muted: var(--bg-elev);
  --muted-foreground: var(--text-dim);
  --accent-color: var(--bg-hover);
  --accent-color-foreground: var(--text);
  --destructive: var(--red);
  --destructive-foreground: oklch(0.99 0.02 90);
  --input: var(--border);
  --ring: var(--accent);
}

[data-theme='light'] {
  --bg: oklch(0.975 0.005 85);
  --bg-panel: oklch(0.945 0.007 85);
  --bg-elev: oklch(0.995 0.003 85);
  --bg-hover: oklch(0.915 0.009 85);
  --border: oklch(0.875 0.008 85);
  --border-soft: oklch(0.915 0.007 85);
  --text: oklch(0.265 0.012 75);
  --text-dim: oklch(0.46 0.012 75);
  --text-faint: oklch(0.64 0.012 75);
  --accent: oklch(0.6 0.12 70);
  --accent-ink: oklch(0.99 0.02 90);
  --accent-soft: oklch(0.6 0.12 70 / 0.12);
  --accent-line: oklch(0.6 0.12 70 / 0.3);
  --sel: oklch(0.6 0.12 70 / 0.18);
}
```

> Note: shadcn's Tailwind preset reserves `--accent` for a neutral hover surface, but the
> Bear palette uses `--accent` for the warm gold. We keep `--accent` = gold (the Bear
> meaning) and expose the neutral shadcn "accent" as `--accent-color` to avoid a clash.
> Task 2 maps Tailwind's `accent` utility to `--accent-color`.

- [ ] **Step 2: Replace index.css**

Replace the ENTIRE contents of `src/renderer/src/index.css` with:
```css
@import './theme/tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    margin: 0;
    font-family: var(--ui);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  ::selection {
    background: var(--sel);
  }
}
```

> The hand-filled shadcn HSL `:root`/`.dark` blocks are gone — the palette now lives in
> `tokens.css`. `darkMode: ['class']` in Tailwind is now unused for theming (we switch via
> `[data-theme]`), but leave it; it's harmless.

---

## Task 2: Point Tailwind at the tokens (drop hsl wrapper)

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Replace the `colors` block**

In `tailwind.config.js`, replace the entire `colors: { ... }` object inside `theme.extend` with:
```js
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)'
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)'
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)'
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)'
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
          foreground: 'var(--accent-color-foreground)'
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)'
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)'
        }
      },
```
Leave `borderRadius`, `container`, and `plugins` unchanged.

> `accent` maps to `--accent-color` (neutral hover surface) so existing `bg-accent`
> hover classes in App.tsx stay a subtle surface, not the gold. The gold is reached via
> `text-primary` / `bg-primary` / `--accent` in CSS.

---

## Task 3: Point the CodeMirror theme at the semantic tokens

**Files:**
- Modify: `src/renderer/src/editor/livePreview/theme.ts`

- [ ] **Step 1: Replace theme.ts**

```ts
import { EditorView } from '@codemirror/view'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

/**
 * Visual styling for the editor + live-preview decoration classes, driven by
 * the semantic Bear tokens in tokens.css. Light/dark is handled by the
 * `[data-theme]` cascade, so this theme is not hard-coded to either.
 */
export const marginEditorTheme = EditorView.theme({
  // Caret + selection.
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-content ::selection': { backgroundColor: 'var(--sel)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sel)' },

  '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
  '.cm-h1': { fontSize: '1.62em' },
  '.cm-h2': { fontSize: '1.32em' },
  '.cm-h3': { fontSize: '1.1em' },
  '.cm-h4': { fontSize: '1em' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'var(--text-dim)' },

  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--text-dim)' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-elev)',
    padding: '0.1em 0.3em',
    borderRadius: '4px'
  },

  '.cm-blockquote': {
    borderLeft: '3px solid var(--accent)',
    paddingLeft: '0.8em',
    color: 'var(--text-dim)'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-elev)'
  },

  '.cm-link': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },

  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '0.4em 0'
  },

  '.cm-task-checkbox': { marginRight: '0.4em', verticalAlign: 'middle' },

  '.cm-frontmatter': {
    fontFamily: MONO,
    fontSize: '0.85em',
    color: 'var(--text-dim)'
  }
})
```

> `{ dark: true }` is removed: CM's base light/dark defaults are overridden by our
> explicit token colors, and the `[data-theme]` cascade now drives both modes.

- [ ] **Step 2: Make the editor content use the UI font token**

In `src/renderer/src/components/Editor.tsx`, find the inner `EditorView.theme({ ... })` in the extensions array (the one with `.cm-content` maxWidth/padding) and change its `.cm-content` `fontFamily` from the literal system stack to the token:
```ts
          '.cm-content': {
            maxWidth: '720px',
            margin: '0 auto',
            padding: '56px 40px',
            fontFamily: 'var(--ui)',
            lineHeight: '1.72'
          }
```
Leave the rest of that theme block (the `'&'` height/fontSize) unchanged.

---

## Task 4: Verify M3a (palette) — typecheck, tests, build, commit

**Files:** none (verification + commit)

- [ ] **Step 1: Typecheck + tests + build**

Run (write to a temp file and Read it, per the env note):
```bash
npm run typecheck > /tmp/m3a.txt 2>&1; echo "tc=$?" >> /tmp/m3a.txt
npx vitest run >> /tmp/m3a.txt 2>&1
npm run build >> /tmp/m3a.txt 2>&1; echo "build=$?" >> /tmp/m3a.txt
```
Expected in `/tmp/m3a.txt`: `tc=0`, `40 passed` (existing suite unaffected), `build=0`.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/theme/tokens.css src/renderer/src/index.css \
  tailwind.config.js src/renderer/src/editor/livePreview/theme.ts \
  src/renderer/src/components/Editor.tsx
git commit -m "feat(theme): Bear warm-gold oklch palette (dark+light) as token source of truth"
```

---

# Milestone M3b — IBM Plex fonts + CSP

## Task 5: Install @fontsource IBM Plex and create the font import module

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/renderer/src/theme/fonts.ts`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Install the three font packages**

```bash
npm install @fontsource/ibm-plex-sans@^5.2.6 @fontsource/ibm-plex-mono@^5.2.6 @fontsource/ibm-plex-serif@^5.2.5
```
Expected: installs, `package.json` dependencies include all three, no errors. (Do NOT install `ibm-plex-sans-sc` — it does not exist; Chinese is served by system PingFang SC.)

- [ ] **Step 2: Create the font import module**

`src/renderer/src/theme/fonts.ts`:
```ts
// Latin glyphs from bundled IBM Plex (woff2). Chinese falls through the font
// stack to the system PingFang SC. Only the weights we use are imported.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-serif/400.css'
import '@fontsource/ibm-plex-serif/500.css'
```

- [ ] **Step 3: Import fonts once at the entry**

In `src/renderer/src/main.tsx`, add this import **above** the `import './index.css'` line:
```ts
import './theme/fonts'
```

---

## Task 6: Allow bundled fonts in the CSP

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add font-src to the CSP**

In `src/renderer/index.html`, change the CSP `content` from:
```
default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
```
to:
```
default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;
```

> @fontsource woff2 files are bundled by Vite as local assets served from the app origin,
> so `'self'` (plus `data:` for any inlined fonts) is sufficient — no network source is opened.

---

## Task 7: Verify M3b (fonts) — build, commit

**Files:** none (verification + commit)

- [ ] **Step 1: Typecheck + build (fonts must bundle without error)**

```bash
npm run typecheck > /tmp/m3b.txt 2>&1; echo "tc=$?" >> /tmp/m3b.txt
npm run build >> /tmp/m3b.txt 2>&1; echo "build=$?" >> /tmp/m3b.txt
```
Expected in `/tmp/m3b.txt`: `tc=0`, `build=0`, and the build output lists woff2 font assets emitted under `out/renderer/assets/`.

- [ ] **Step 2: Confirm fonts were emitted**

```bash
ls out/renderer/assets/ | grep -ci woff2 > /tmp/woff.txt 2>&1; cat /tmp/woff.txt
```
Expected: a number > 0 (woff2 files emitted).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/renderer/src/theme/fonts.ts \
  src/renderer/src/main.tsx src/renderer/index.html
git commit -m "feat(theme): bundle IBM Plex (sans/mono/serif) + allow fonts in CSP"
```

---

# Milestone M3c — Follow-system theme toggle

## Task 8: resolveTheme pure function + themeStore (TDD)

**Files:**
- Create: `src/renderer/src/stores/themeStore.ts`
- Test: `test/resolveTheme.test.ts`, `test/themeStore.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/resolveTheme.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveTheme } from '@/stores/themeStore'

describe('resolveTheme', () => {
  it('auto + system dark → dark', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
  })
  it('auto + system light → light', () => {
    expect(resolveTheme('auto', false)).toBe('light')
  })
  it('explicit dark ignores system', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('explicit light ignores system', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })
})
```

`test/themeStore.test.ts`:
```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ mode: 'auto' })
})

describe('themeStore', () => {
  it('defaults to auto', () => {
    expect(useThemeStore.getState().mode).toBe('auto')
  })

  it('setMode updates and persists to localStorage', () => {
    useThemeStore.getState().setMode('dark')
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(localStorage.getItem('margin.themeMode')).toBe('dark')
  })

  it('cycleMode goes auto → light → dark → auto', () => {
    const { cycleMode } = useThemeStore.getState()
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('light')
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('dark')
    cycleMode()
    expect(useThemeStore.getState().mode).toBe('auto')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- resolveTheme themeStore`
Expected: FAIL — cannot resolve `@/stores/themeStore`.

- [ ] **Step 3: Implement themeStore.ts**

```ts
import { create } from 'zustand'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'margin.themeMode'
const CYCLE: ThemeMode[] = ['auto', 'light', 'dark']

/** Resolve the mode + system signal to the concrete theme to apply. */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): EffectiveTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light'
  return mode
}

function loadInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage unavailable (e.g. SSR/test) — fall back to auto.
  }
  return 'auto'
}

interface ThemeState {
  mode: ThemeMode
  setMode(mode: ThemeMode): void
  cycleMode(): void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: loadInitialMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore persistence failure
    }
    set({ mode })
  },
  cycleMode: () => {
    const next = CYCLE[(CYCLE.indexOf(get().mode) + 1) % CYCLE.length]
    get().setMode(next)
  }
}))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- resolveTheme themeStore`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/themeStore.ts test/resolveTheme.test.ts test/themeStore.test.ts
git commit -m "feat(theme): themeStore + resolveTheme (tri-state, persisted) — TDD"
```

---

## Task 9: useSystemTheme hook

**Files:**
- Create: `src/renderer/src/hooks/useSystemTheme.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * Subscribe to the OS dark-mode preference. On Electron renderer this tracks
 * macOS appearance automatically — no IPC / nativeTheme needed.
 */
export function useSystemTheme(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent): void => setDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return dark
}
```

---

## Task 10: ThemeToggle component

**Files:**
- Create: `src/renderer/src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create the toggle button**

```tsx
import { Monitor, Moon, Sun } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'

const LABEL: Record<ThemeMode, string> = {
  auto: 'Theme: follow system (click to lock light)',
  light: 'Theme: light (click to lock dark)',
  dark: 'Theme: dark (click to follow system)'
}

export function ThemeToggle(): JSX.Element {
  const mode = useThemeStore((s) => s.mode)
  const cycleMode = useThemeStore((s) => s.cycleMode)

  const Icon = mode === 'auto' ? Monitor : mode === 'light' ? Sun : Moon

  return (
    <button
      onClick={cycleMode}
      title={LABEL[mode]}
      aria-label={LABEL[mode]}
      className="grid h-[26px] w-[30px] place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon size={16} />
    </button>
  )
}
```

> `lucide-react` is already a dependency (used nowhere yet). Icons: Monitor=auto, Sun=light, Moon=dark.

---

## Task 11: Apply the theme in App + mount the toggle

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add imports**

In `src/renderer/src/App.tsx`, add to the import block:
```tsx
import { ThemeToggle } from '@/components/ThemeToggle'
import { useThemeStore, resolveTheme } from '@/stores/themeStore'
import { useSystemTheme } from '@/hooks/useSystemTheme'
```

- [ ] **Step 2: Compute and apply the effective theme**

Inside the `App` component body, after the existing `useDocumentStore` selectors, add:
```tsx
  const themeMode = useThemeStore((s) => s.mode)
  const systemDark = useSystemTheme()

  useEffect(() => {
    const effective = resolveTheme(themeMode, systemDark)
    const root = document.documentElement
    if (effective === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
  }, [themeMode, systemDark])
```

> Dark is the `:root` default, so we only set `data-theme` for light and remove it for dark.
> `useEffect` is already imported in App.tsx (used by the autosave-flush effect).

- [ ] **Step 3: Mount the toggle in the header**

In the header JSX, the save-status span currently uses `ml-auto` to push right. Place the
toggle just before it so both sit on the right. Change:
```tsx
        <span className="ml-auto text-xs">
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
        </span>
```
to:
```tsx
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs">
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
          </span>
          <ThemeToggle />
        </div>
```

---

## Task 12: DOM test for theme application

**Files:**
- Test: `test/theme-dom.test.ts`

- [ ] **Step 1: Write the test**

`test/theme-dom.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTheme } from '@/stores/themeStore'

// Mirrors the App effect: dark = no attribute, light = data-theme="light".
function applyTheme(mode: 'auto' | 'light' | 'dark', systemDark: boolean): void {
  const effective = resolveTheme(mode, systemDark)
  const root = document.documentElement
  if (effective === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
}

afterEach(() => document.documentElement.removeAttribute('data-theme'))

describe('theme application to <html>', () => {
  it('light mode sets data-theme="light"', () => {
    applyTheme('light', false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('dark mode removes data-theme', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    applyTheme('dark', true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('auto follows the system signal', () => {
    applyTheme('auto', true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false) // dark
    applyTheme('auto', false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm test -- theme-dom`
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useSystemTheme.ts src/renderer/src/components/ThemeToggle.tsx \
  src/renderer/src/App.tsx test/theme-dom.test.ts
git commit -m "feat(theme): follow-system + manual override toggle, applied to <html>"
```

---

## Task 13: Full verification + manual GUI acceptance

**Files:** none

- [ ] **Step 1: Headless full check**

```bash
npm run typecheck > /tmp/m3final.txt 2>&1; echo "tc=$?" >> /tmp/m3final.txt
npx vitest run >> /tmp/m3final.txt 2>&1
npm run build >> /tmp/m3final.txt 2>&1; echo "build=$?" >> /tmp/m3final.txt
```
Read `/tmp/m3final.txt`. Expected: `tc=0`, all tests pass (40 prior + 7 themeStore/resolveTheme + 3 theme-dom = 50), `build=0`.

- [ ] **Step 2: Manual GUI acceptance (controller or user)**

Launch `npm run dev`, open `/Users/jianjustin/margin-acceptance.md`, and verify:
1. Dark theme is the warm Bear palette (warm-gray bg, gold accent on links/quote bar), not the old flat gray.
2. Latin text renders in IBM Plex Sans; code in IBM Plex Mono; Chinese in PingFang SC (no tofu/boxes).
3. Body line-height looks airy (1.72); editor column is centered at ~720px.
4. The theme button in the header cycles Monitor → Sun → Moon; clicking Sun forces light (Bear light palette), Moon forces dark, Monitor follows system.
5. With the button on Monitor (auto), changing macOS appearance (System Settings → Appearance) flips the editor live.
6. The caret is visible in both light and dark.

> GUI screenshot automation does not work in this environment (screencapture misses the
> Electron window; Open needs a native dialog), so Step 2 is a human/controller eyeball check.

- [ ] **Step 3: Push**

```bash
git push origin main > /tmp/push.txt 2>&1; echo "exit=$?" >> /tmp/push.txt
```
Read `/tmp/push.txt`; expect the `main -> main` refspec line and `exit=0`.

---

## Self-review notes (for the implementer)

- **Spec coverage:** §2 tokens (Tasks 1–3), §2.3 shadcn mapping + Tailwind unwrap (Tasks 1–2), §2.4 CM6 tokens (Task 3), §3 fonts + 720/1.72 typography (Tasks 3,5), §3.4 CSP (Task 6), §4 tri-state follow-system (Tasks 8–11), §6 tests (Tasks 8,12,13). The Chinese-font decision (§9) is realized by the font stack in Task 1 + not installing sans-sc in Task 5.
- **Source-of-truth invariant:** nothing here touches the document or editor logic; theme is pure CSS-variable cascade + an `<html>` attribute. Markdown round-trip is unaffected.
- **Naming consistency:** `--accent` = Bear gold throughout; shadcn's neutral "accent" surface is `--accent-color` (Task 1) and Tailwind's `accent` utility maps to it (Task 2) — so `hover:bg-accent` stays a subtle surface, while gold is `--accent` / `text-primary`.
- **Deferred (noted, not built):** 5-accent switching, runtime font/size UI, Serif in body, full title bar (M5), `nativeTheme` IPC.
- **Known carry-over:** the M1 review's autosave-concurrency / IPC-error items were addressed in `8e5e3f9`; nothing M3-specific reopens them.
