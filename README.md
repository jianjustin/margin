# Margin

A Markdown editor for Obsidian vaults — Bear typography, Obsidian data model.
Built on Electron + React + TypeScript (Vite via `electron-vite`), Tailwind/shadcn,
Zustand, and CodeMirror 6.

## Requirements

- Node.js 20+ and npm 10+
- macOS (the app uses `titleBarStyle: 'hiddenInset'`; other platforms run but are untested)

## Getting started

```bash
# 1. Install dependencies (also downloads the Electron binary)
npm install

# 2. Launch the app in development (hot reload for main + renderer)
npm run dev
```

`npm run dev` builds the Electron main and preload processes, starts the Vite
dev server for the renderer at `http://localhost:5173/`, and opens the app
window. Use **Open…** in the header to open a Markdown file, then edit — changes
autosave 800 ms after you stop typing, and ⌘S saves immediately.

> If `npm run dev` fails with `Error: Electron uninstall`, the Electron binary
> didn't download during install. Fetch it manually:
> `node node_modules/electron/install.js`

## Verify

Run the full check before committing:

```bash
npm run typecheck   # tsc for both the node (main/preload) and web (renderer) projects
npm test            # vitest unit tests (run once)
npm run build       # production build into out/
```

Other useful scripts:

```bash
npm run test:watch  # vitest in watch mode
npm run preview     # preview the production build
```

## Status

M1 — single-file editor. Open / edit / autosave with a hardened save path
(in-flight guard, re-save on mid-write changes, error recovery).
See `docs/superpowers/plans/` in the parent vault for the roadmap.
