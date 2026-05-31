# Margin v2 — M0 Foundation + M1 Single-File Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native Swift app on `main` with a runnable Electron + React + CodeMirror 6 desktop app that can open, edit, and save a single Markdown file.

**Architecture:** Three-process Electron app (main / preload / renderer) scaffolded with electron-vite. Renderer is React + TypeScript + Tailwind + shadcn/ui foundation, state in Zustand. The editor is a CodeMirror 6 instance holding the raw Markdown string as the single source of truth. The renderer never touches `fs` directly — all file I/O goes through a typed IPC bridge exposed by preload. Pure logic (the document store) is unit-tested with Vitest; the editor and IPC wiring are verified by running the app.

**Tech Stack:** Electron 33, electron-vite 2, Vite 5, React 18, TypeScript 5.6, Tailwind 3.4, shadcn/ui, Zustand 5, CodeMirror 6, Vitest 2.

---

## Context for the implementer

You are working in the git repository at `/Users/jianjustin/workspaces/margin`. Today it contains a **native macOS Swift app** (Xcode project, `Sources/`, `Tests/`). We are throwing that away on `main` (after backing it up to a branch) and rebuilding from scratch as an Electron app. Read the design spec first: [docs/superpowers/specs/2026-05-31-margin-wysiwyg-editor-design.md](../specs/2026-05-31-margin-wysiwyg-editor-design.md).

Key facts you need:
- Node `v22.x`, npm `10.x` are installed.
- The original interaction mockup (交互稿) is **only** at `/tmp/margin-design/` right now (`index.html` + a `margin/` subfolder). `/tmp` is volatile, so Task 2 rescues it into the repo **early**. Do not skip it.
- `.gitignore` currently ignores `*.xcodeproj/`, `build/`, and `Margin.xcodeproj` — so those Xcode artifacts are **untracked** (remove them from disk with `rm`, not `git rm`).
- electron-vite's project layout is `src/main/`, `src/preload/`, `src/renderer/`, with renderer source under `src/renderer/src/`. We add a `src/shared/` folder for types shared across all three processes.
- Config files `tailwind.config.js` and `postcss.config.js` use **CommonJS** (`module.exports`) because `package.json` does **not** set `"type": "module"`.

After M1 the file layout will be:

```
margin/
├─ electron.vite.config.ts        build config (main/preload/renderer)
├─ package.json
├─ tsconfig.json                  references project
├─ tsconfig.node.json             main + preload + shared
├─ tsconfig.web.json              renderer + shared
├─ vitest.config.ts
├─ tailwind.config.js
├─ postcss.config.js
├─ components.json                shadcn config
├─ .gitignore
├─ README.md
├─ src/
│  ├─ shared/
│  │  └─ ipc.ts                   IPC channel names + MarginApi type
│  ├─ main/
│  │  └─ index.ts                 window + IPC handlers (file read/write/open)
│  ├─ preload/
│  │  └─ index.ts                 contextBridge → window.margin
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx              React entry
│        ├─ App.tsx               shell: open / edit / save wiring
│        ├─ index.css            tailwind + shadcn css vars (dark)
│        ├─ env.d.ts              window.margin typing
│        ├─ lib/utils.ts          shadcn cn()
│        ├─ stores/documentStore.ts
│        └─ components/Editor.tsx CodeMirror 6 React wrapper
├─ docs/                          (spec, this plan, rescued 交互稿)
└─ test/
   └─ documentStore.test.ts
```

---

# Milestone M0 — Foundation

## Task 1: Back up the Swift app to an archive branch

**Files:** none (git operations only)

- [ ] **Step 1: Create and push the archive branch from current `main`**

Run:
```bash
git checkout -b archive/swift-textkit-v1
git push -u origin archive/swift-textkit-v1
git checkout main
```
Expected: branch `archive/swift-textkit-v1` is created at the current HEAD, pushed to origin, and you are back on `main`. `git branch` now lists both `main` and `archive/swift-textkit-v1`.

- [ ] **Step 2: Verify the backup contains the Swift sources**

Run:
```bash
git ls-tree -r archive/swift-textkit-v1 --name-only | grep -c 'Sources/Margin'
```
Expected: a number `> 0` (the Swift files are preserved on the archive branch).

---

## Task 2: Rescue the interaction mockup (交互稿) into the repo

**Files:**
- Create: `docs/design/` (populated from `/tmp/margin-design/`)

- [ ] **Step 1: Copy the mockup from /tmp into the repo**

Run:
```bash
mkdir -p docs/design
cp -R /tmp/margin-design/. docs/design/
```
Expected: no output (success).

- [ ] **Step 2: Verify the mockup landed**

Run:
```bash
ls docs/design && test -f docs/design/index.html && echo "OK: index.html present"
```
Expected: a listing that includes `index.html` and `margin`, then `OK: index.html present`.

> If `/tmp/margin-design/` no longer exists, STOP and ask the user for the mockup — do not proceed without it.

- [ ] **Step 3: Commit the rescued mockup**

```bash
git add docs/design
git commit -m "docs: rescue Bear-style interaction mockup into docs/design"
```

---

## Task 3: Clear the Swift app from `main`

**Files:**
- Delete: `Sources/`, `Tests/`, `project.yml`, old `docs/specs/`, old `docs/plans/`, `docs/M*-verification.md`
- Delete from disk (untracked): `Margin.xcodeproj/`, `build/`

- [ ] **Step 1: Remove tracked Swift + Xcode files**

Run:
```bash
git rm -rq Sources Tests project.yml
git rm -rq docs/specs docs/plans
git rm -q docs/M1-verification.md docs/M2-verification.md docs/M3-verification.md \
  docs/M3.5-verification.md docs/M3.6-verification.md docs/M3.7-verification.md docs/M3.8-verification.md
```
Expected: no output. (These remove the old native-app sources and the **old** Swift-era docs. The new spec under `docs/superpowers/specs/`, this plan under `docs/superpowers/plans/`, and `docs/design/` are kept.)

- [ ] **Step 2: Remove untracked Xcode build artifacts from disk**

Run:
```bash
rm -rf Margin.xcodeproj build
```
Expected: no output.

- [ ] **Step 3: Verify what remains**

Run:
```bash
git ls-files | grep -vE '^docs/' && echo '--- docs kept ---' && git ls-files docs
```
Expected: outside `docs/` only `.gitignore` and `README.md` remain tracked; under `docs/` you see the new spec, this plan, and `docs/design/...`. No `Sources/`, `Tests/`, or `project.yml`.

- [ ] **Step 4: Commit the clearing**

```bash
git commit -m "chore: clear native Swift app from main (preserved on archive/swift-textkit-v1)"
```

---

## Task 4: Create package.json and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "margin",
  "version": "0.1.0",
  "description": "A Typora-style WYSIWYG Markdown editor for Obsidian vaults",
  "main": "./out/main/index.js",
  "author": "jianjustin",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@codemirror/commands": "^6.7.1",
    "@codemirror/lang-markdown": "^6.3.1",
    "@codemirror/language": "^6.10.3",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.34.1",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.4",
    "tailwindcss-animate": "^1.0.7",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "electron": "^33.2.0",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Install**

Run:
```bash
npm install
```
Expected: dependencies install, `node_modules/` and `package-lock.json` created, no errors (deprecation warnings are fine).

- [ ] **Step 3: Verify electron resolved**

Run:
```bash
npx electron --version
```
Expected: prints `v33.x.x`.

---

## Task 5: Add .gitignore, tsconfigs, and the electron-vite config

**Files:**
- Modify: `.gitignore` (replace Xcode rules with Node rules)
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`

- [ ] **Step 1: Replace .gitignore**

Replace the entire contents of `.gitignore` with:
```gitignore
# Dependencies
node_modules/

# Build output
out/
dist/

# Logs
*.log
npm-debug.log*

# macOS
.DS_Store

# Editor
.vscode/
.idea/
```

- [ ] **Step 2: Create tsconfig.json (references project)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 3: Create tsconfig.node.json (main + preload + shared)**

```json
{
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Create tsconfig.web.json (renderer + shared)**

```json
{
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.web.tsbuildinfo",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/renderer/src/*"] }
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 5: Create electron.vite.config.ts**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

---

## Task 6: Main process — window only (IPC added in M1)

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Write the main process entry**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

---

## Task 7: Preload — empty bridge (filled in M1)

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: Write a minimal preload**

```ts
import { contextBridge } from 'electron'

// The real API surface is added in M1 (Task 14).
contextBridge.exposeInMainWorld('margin', {})
```

---

## Task 8: Renderer — React entry and smoke shell

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`

- [ ] **Step 1: Create the HTML host (dark mode forced via class)**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    />
    <title>Margin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the React entry**

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Create a smoke-test App**

`src/renderer/src/App.tsx`:
```tsx
export default function App(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-2xl font-semibold">Margin</h1>
    </div>
  )
}
```

---

## Task 9: Tailwind + shadcn/ui foundation

**Files:**
- Create: `postcss.config.js`, `tailwind.config.js`, `components.json`, `src/renderer/src/lib/utils.ts`, `src/renderer/src/index.css`

- [ ] **Step 1: Create postcss.config.js (CommonJS)**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 2: Create tailwind.config.js (CommonJS, shadcn theme)**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
```

- [ ] **Step 3: Create components.json (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/renderer/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Create the shadcn cn() helper**

`src/renderer/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create index.css with shadcn neutral-dark variables**

`src/renderer/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 10.2%;
    --foreground: 0 0% 90.2%;
    --card: 0 0% 12.5%;
    --card-foreground: 0 0% 90.2%;
    --popover: 0 0% 12.5%;
    --popover-foreground: 0 0% 90.2%;
    --primary: 45 60% 65%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 16%;
    --secondary-foreground: 0 0% 90.2%;
    --muted: 0 0% 16%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 18%;
    --accent-foreground: 0 0% 90.2%;
    --destructive: 0 62.8% 50%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 18%;
    --input: 0 0% 18%;
    --ring: 45 60% 65%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }
}
```

> Note: these are placeholder shadcn neutral-dark values with a warm-gold `--primary`/`--ring` so the app already looks roughly on-brand. The **exact** Bear oklch palette and IBM Plex fonts are implemented in M3, not here.

---

## Task 10: Add Vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write vitest.config.ts**

```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  }
})
```

---

## Task 11: Boot, typecheck, and commit the foundation

**Files:** none (verification + commit)

- [ ] **Step 1: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: no type errors (exit code 0).

- [ ] **Step 2: Production build smoke test**

Run:
```bash
npm run build
```
Expected: electron-vite builds `out/main/index.js`, `out/preload/index.js`, and `out/renderer/...` with no errors.

- [ ] **Step 3: Launch the dev app**

Run:
```bash
npm run dev
```
Expected: an Electron window opens showing a dark background with centered **"Margin"** heading. Confirm visually, then quit (Cmd-Q or close the window).

- [ ] **Step 4: Commit the foundation**

```bash
git add -A
git commit -m "feat: scaffold Electron + React + Tailwind/shadcn + Zustand + Vitest foundation"
```

---

# Milestone M1 — Single-File Editor

## Task 12: Shared IPC contract

**Files:**
- Create: `src/shared/ipc.ts`

- [ ] **Step 1: Define channel names and the API type**

```ts
export const IPC = {
  dialogOpenFile: 'dialog:openFile',
  fileRead: 'file:read',
  fileWrite: 'file:write'
} as const

export interface MarginApi {
  /** Show an open dialog; returns the chosen .md path, or null if cancelled. */
  openFile(): Promise<string | null>
  /** Read a UTF-8 file and return its contents. */
  readFile(path: string): Promise<string>
  /** Write UTF-8 content to a file. */
  writeFile(path: string, content: string): Promise<void>
}
```

---

## Task 13: Main process — file I/O IPC handlers

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add imports and handler registration**

Replace the import block at the top of `src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
```
with:
```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '../shared/ipc'

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.dialogOpenFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.fileRead, (_event, path: string) => readFile(path, 'utf-8'))

  ipcMain.handle(IPC.fileWrite, (_event, path: string, content: string) =>
    writeFile(path, content, 'utf-8')
  )
}
```

- [ ] **Step 2: Call registerIpcHandlers on ready**

In the same file, change:
```ts
app.whenReady().then(() => {
  createWindow()
```
to:
```ts
app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
```

---

## Task 14: Preload — expose the typed API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace the preload contents**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type MarginApi } from '../shared/ipc'

const api: MarginApi = {
  openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
  readFile: (path) => ipcRenderer.invoke(IPC.fileRead, path),
  writeFile: (path, content) => ipcRenderer.invoke(IPC.fileWrite, path, content)
}

contextBridge.exposeInMainWorld('margin', api)
```

- [ ] **Step 2: Declare the global window typing for the renderer**

Create `src/renderer/src/env.d.ts`:
```ts
/// <reference types="vite/client" />
import type { MarginApi } from '../../shared/ipc'

declare global {
  interface Window {
    margin: MarginApi
  }
}

export {}
```

---

## Task 15: Document store (Zustand) — TDD

**Files:**
- Create: `src/renderer/src/stores/documentStore.ts`
- Test: `test/documentStore.test.ts`

- [ ] **Step 1: Write the failing test**

`test/documentStore.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

function reset(): void {
  useDocumentStore.setState({
    path: null,
    content: '',
    savedContent: '',
    saveStatus: 'saved'
  })
}

describe('documentStore', () => {
  beforeEach(reset)

  it('starts clean with no file', () => {
    const s = useDocumentStore.getState()
    expect(s.path).toBeNull()
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('load sets path/content and is clean', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    const s = useDocumentStore.getState()
    expect(s.path).toBe('/notes/a.md')
    expect(s.content).toBe('# Hello')
    expect(s.savedContent).toBe('# Hello')
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })

  it('editing content marks the document dirty', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    useDocumentStore.getState().setContent('# Hello world')
    const s = useDocumentStore.getState()
    expect(s.isDirty()).toBe(true)
    expect(s.saveStatus).toBe('dirty')
  })

  it('setting content back to saved value is not dirty', () => {
    useDocumentStore.getState().load('/notes/a.md', '# Hello')
    useDocumentStore.getState().setContent('changed')
    useDocumentStore.getState().setContent('# Hello')
    expect(useDocumentStore.getState().isDirty()).toBe(false)
  })

  it('markSaving then markSaved clears dirty and syncs savedContent', () => {
    useDocumentStore.getState().load('/notes/a.md', 'a')
    useDocumentStore.getState().setContent('b')
    useDocumentStore.getState().markSaving()
    expect(useDocumentStore.getState().saveStatus).toBe('saving')
    useDocumentStore.getState().markSaved('b')
    const s = useDocumentStore.getState()
    expect(s.savedContent).toBe('b')
    expect(s.isDirty()).toBe(false)
    expect(s.saveStatus).toBe('saved')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- documentStore
```
Expected: FAIL — cannot resolve `@/stores/documentStore` (module does not exist yet).

- [ ] **Step 3: Implement the store**

`src/renderer/src/stores/documentStore.ts`:
```ts
import { create } from 'zustand'

export type SaveStatus = 'saved' | 'saving' | 'dirty'

interface DocumentState {
  path: string | null
  content: string
  savedContent: string
  saveStatus: SaveStatus
  isDirty(): boolean
  load(path: string, content: string): void
  setContent(content: string): void
  markSaving(): void
  markSaved(content: string): void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  path: null,
  content: '',
  savedContent: '',
  saveStatus: 'saved',

  isDirty: () => get().content !== get().savedContent,

  load: (path, content) =>
    set({ path, content, savedContent: content, saveStatus: 'saved' }),

  setContent: (content) =>
    set((state) => ({
      content,
      saveStatus: content === state.savedContent ? 'saved' : 'dirty'
    })),

  markSaving: () => set({ saveStatus: 'saving' }),

  markSaved: (content) =>
    set((state) => ({
      savedContent: content,
      saveStatus: state.content === content ? 'saved' : 'dirty'
    }))
}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm test -- documentStore
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/index.ts src/preload/index.ts \
  src/renderer/src/env.d.ts src/renderer/src/stores/documentStore.ts test/documentStore.test.ts
git commit -m "feat: IPC file I/O bridge + document store (TDD)"
```

---

## Task 16: CodeMirror 6 editor component

**Files:**
- Create: `src/renderer/src/components/Editor.tsx`

- [ ] **Step 1: Write the editor wrapper**

`src/renderer/src/components/Editor.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

interface EditorProps {
  /** Identifies the open document; changing it reloads the editor contents. */
  docKey: string | null
  /** Initial text for the current docKey. */
  initialValue: string
  /** Called on every edit with the full document text. */
  onChange: (value: string) => void
  /** Called when the user presses Cmd/Ctrl-S. */
  onSave: () => void
}

export function Editor({ docKey, initialValue, onChange, onSave }: EditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Keep the latest callbacks without re-creating the editor.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  // Create the EditorView once per docKey.
  useEffect(() => {
    if (!hostRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          onSaveRef.current()
          return true
        }
      }
    ])

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
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
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { maxWidth: '720px', margin: '0 auto', padding: '56px 40px' }
        })
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Re-create only when switching documents, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
```

> Why re-create per `docKey`: the editor owns its own undo history and document. When the user opens a different file we want a fresh state, not a `dispatch`-patched one. Within a single document, edits flow out through `onChange` and never need to be pushed back in, so there is no echo loop.

---

## Task 17: Wire the shell — open, edit, autosave

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with the wired shell**

`src/renderer/src/App.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { Editor } from '@/components/Editor'
import { useDocumentStore } from '@/stores/documentStore'

const AUTOSAVE_MS = 800

export default function App(): JSX.Element {
  const path = useDocumentStore((s) => s.path)
  const content = useDocumentStore((s) => s.content)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function openFile(): Promise<void> {
    const chosen = await window.margin.openFile()
    if (!chosen) return
    const text = await window.margin.readFile(chosen)
    useDocumentStore.getState().load(chosen, text)
  }

  async function save(): Promise<void> {
    const s = useDocumentStore.getState()
    if (!s.path || !s.isDirty()) return
    const toWrite = s.content
    s.markSaving()
    await window.margin.writeFile(s.path, toWrite)
    useDocumentStore.getState().markSaved(toWrite)
  }

  function handleChange(value: string): void {
    useDocumentStore.getState().setContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  // Flush a pending autosave on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const fileName = path ? path.split('/').pop() : 'No file open'

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 pl-20 text-sm text-muted-foreground">
        <button
          onClick={() => void openFile()}
          className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground hover:bg-accent"
        >
          Open…
        </button>
        <span className="truncate">{fileName}</span>
        <span className="ml-auto text-xs">
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
        </span>
      </header>
      <main className="min-h-0 flex-1">
        {path ? (
          <Editor
            docKey={path}
            initialValue={content}
            onChange={handleChange}
            onSave={() => void save()}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Open a Markdown file to start editing
          </div>
        )}
      </main>
    </div>
  )
}
```

> Note: `initialValue={content}` is read **only** when `Editor` mounts for a given `docKey` (the file path). Subsequent keystrokes update the store via `onChange` but do not feed back into the editor, so the cursor never jumps.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: no errors.

---

## Task 18: Manual verification of the editing loop

**Files:** none (manual verification)

- [ ] **Step 1: Create a scratch Markdown file**

Run:
```bash
printf '# Hello Margin\n\nFirst paragraph.\n' > /tmp/margin-scratch.md
```

- [ ] **Step 2: Launch the app**

Run:
```bash
npm run dev
```

- [ ] **Step 3: Exercise open → edit → autosave**

In the window:
1. Click **Open…**, choose `/tmp/margin-scratch.md`. The breadcrumb shows `margin-scratch.md` and the editor shows the file's text.
2. Type a new line. The status flips to **Unsaved**, then to **Saved** ~0.8s after you stop typing.
3. Press **Cmd-S** — status shows **Saved** immediately.

- [ ] **Step 4: Confirm the write reached disk**

In a separate terminal, run:
```bash
cat /tmp/margin-scratch.md
```
Expected: the file contains your edits. Then quit the app.

- [ ] **Step 5: Final M1 checks and commit**

Run:
```bash
npm run typecheck && npm test && npm run build
```
Expected: typecheck clean, tests pass, build succeeds.

```bash
git add -A
git commit -m "feat: single-file editor — CodeMirror 6 + open/edit/autosave"
```

---

## Self-review notes (for the implementer)

- **Spec coverage (this plan):** M0 (repo backup/clear + Electron/Vite/React/TS/Tailwind/shadcn/Zustand scaffold, 交互稿 rescued to `docs/design/`) and M1 (CM6 single-file open/edit/save over typed IPC, markdown text as the single source of truth) from spec §10. Spec §6 Live-Preview, §7 exact Bear theme/IBM Plex, §8 file tree + title/status bars, and §5.2 `file:externalChange` watching are **out of scope here** — they are M2–M5 and get their own plans.
- **Source of truth:** the document `String` lives in CodeMirror and is mirrored into `documentStore.content`; saving writes that string verbatim — no serialization, satisfying the lossless-round-trip constraint.
- **Obsidian-compat constraint:** nothing in M0/M1 injects fields into `.md` or touches `.obsidian/.trash/.git` — we only read/write the exact file the user opens.
- **Deferred to next plan (M2):** the cursor-aware Live-Preview decoration layer is the largest unit and is intentionally not started here; the editor currently shows raw Markdown with syntax highlighting only.
