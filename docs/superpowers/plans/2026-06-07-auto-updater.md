# 自动更新功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 使用 electron-updater 添加手动"检查更新"功能，配合应用内 `UpdateBanner` 组件展示下载进度和安装重启操作。

**架构：** 主进程通过 `updater.ts` 封装 electron-updater，将事件通过 `updater:status` IPC 通道推送到渲染进程。渲染进程通过 `useUpdater` hook 消费状态，并通过 `UpdateBanner` 组件在应用顶部展示。三个用户触发的 IPC 调用（`check` / `download` / `install`）驱动状态机。macOS 应用菜单提供"检查更新…"入口。

**技术栈：** electron-updater, Electron IPC, React hooks, Zustand 风格状态管理, Tailwind CSS

---

## 文件清单

| 操作 | 路径 | 职责 |
|------|------|------|
| 新建 | `src/shared/updaterTypes.ts` | `UpdateStatus` 联合类型定义 |
| 修改 | `src/shared/ipc.ts` | 添加 updater IPC channel 常量 + `UpdaterApi` 接口 |
| 新建 | `src/main/updater.ts` | 封装 electron-updater，注册 IPC handler，推送状态 |
| 修改 | `src/main/index.ts` | 初始化 updater，构建 macOS 应用菜单 |
| 修改 | `src/preload/index.ts` | 通过 contextBridge 暴露 `updater` API |
| 修改 | `src/renderer/src/env.d.ts` | 在 Window 类型上添加 `UpdaterApi` |
| 新建 | `src/renderer/src/hooks/useUpdater.ts` | 更新状态管理 React hook |
| 新建 | `src/renderer/src/components/UpdateBanner.tsx` | 应用内更新通知 UI 组件 |
| 修改 | `src/renderer/src/App.tsx` | 挂载 `UpdateBanner` |
| 新建 | `test/updater.test.ts` | 主进程 updater 模块单元测试 |
| 新建 | `test/useUpdater-dom.test.tsx` | hook + banner DOM 测试 |

---

### Task 1: 定义 `UpdateStatus` 类型

**文件：**
- 新建: `src/shared/updaterTypes.ts`

- [ ] **步骤 1: 创建 `UpdateStatus` 类型文件**

```ts
// src/shared/updaterTypes.ts
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
  | { state: 'installing' }
```

- [ ] **步骤 2: 验证类型检查通过**

执行: `npm run typecheck:node`
预期: 通过（无错误）

- [ ] **步骤 3: 提交**

```bash
git add src/shared/updaterTypes.ts
git commit -m "feat(updater): add UpdateStatus type definition"
```

---

### Task 2: 添加 IPC channel 常量和 `UpdaterApi` 接口

**文件：**
- 修改: `src/shared/ipc.ts`

- [ ] **步骤 1: 在 `IPC` 对象中添加 updater channel**

在 `src/shared/ipc.ts` 的 `IPC` 常量末尾（`} as const` 之前）添加：

```ts
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterStatus: 'updater:status'
```

- [ ] **步骤 2: 添加 `UpdaterApi` 接口**

在 `src/shared/ipc.ts` 中，`MarginApi` 接口下方添加：

```ts
export interface UpdaterApi {
  check(): Promise<void>
  download(): Promise<void>
  install(): Promise<void>
  onStatus(callback: (status: import('./updaterTypes').UpdateStatus) => void): () => void
}
```

- [ ] **步骤 3: 验证类型检查通过**

执行: `npm run typecheck`
预期: 通过

- [ ] **步骤 4: 提交**

```bash
git add src/shared/ipc.ts
git commit -m "feat(updater): add IPC channels and UpdaterApi interface"
```

---

### Task 3: 主进程 updater 模块 — 测试先行

**文件：**
- 新建: `test/updater.test.ts`
- 新建: `src/main/updater.ts`

- [ ] **步骤 1: 编写 updater 模块的失败测试**

```ts
// test/updater.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(null),
  downloadUpdate: vi.fn().mockResolvedValue([]),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
}

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}))

import { initUpdater, type UpdaterDeps } from '../src/main/updater'

function makeDeps(overrides?: Partial<UpdaterDeps>): UpdaterDeps {
  return {
    handle: vi.fn(),
    sendToAllWindows: vi.fn(),
    ...overrides,
  }
}

describe('initUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAutoUpdater.autoDownload = true
    mockAutoUpdater.autoInstallOnAppQuit = true
  })

  it('disables autoDownload and autoInstallOnAppQuit', () => {
    initUpdater(makeDeps())
    expect(mockAutoUpdater.autoDownload).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false)
  })

  it('registers three IPC handlers', () => {
    const deps = makeDeps()
    initUpdater(deps)
    const channels = (deps.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0]
    )
    expect(channels).toContain('updater:check')
    expect(channels).toContain('updater:download')
    expect(channels).toContain('updater:install')
  })

  it('subscribes to electron-updater events', () => {
    initUpdater(makeDeps())
    const events = (mockAutoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0]
    )
    expect(events).toContain('update-available')
    expect(events).toContain('update-not-available')
    expect(events).toContain('download-progress')
    expect(events).toContain('update-downloaded')
    expect(events).toContain('error')
  })

  it('returns actions with checkForUpdates', () => {
    const actions = initUpdater(makeDeps())
    expect(typeof actions.checkForUpdates).toBe('function')
  })

  it('check handler calls checkForUpdates and sends checking status', async () => {
    const deps = makeDeps()
    initUpdater(deps)
    const checkHandler = (deps.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'updater:check'
    )![1] as () => Promise<void>
    await checkHandler()
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
    expect(deps.sendToAllWindows).toHaveBeenCalledWith('updater:status', {
      state: 'checking',
    })
  })

  it('download handler calls downloadUpdate', async () => {
    const deps = makeDeps()
    initUpdater(deps)
    const dlHandler = (deps.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'updater:download'
    )![1] as () => Promise<void>
    await dlHandler()
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('install handler calls quitAndInstall', () => {
    const deps = makeDeps()
    initUpdater(deps)
    const installHandler = (deps.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'updater:install'
    )![1] as () => void
    installHandler()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('forwards update-available as status', () => {
    const deps = makeDeps()
    initUpdater(deps)
    const handler = (mockAutoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'update-available'
    )![1] as (info: { version: string }) => void
    handler({ version: '3.0.0' })
    expect(deps.sendToAllWindows).toHaveBeenCalledWith('updater:status', {
      state: 'available',
      version: '3.0.0',
    })
  })

  it('forwards download-progress as status', () => {
    const deps = makeDeps()
    initUpdater(deps)
    const handler = (mockAutoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'download-progress'
    )![1] as (info: { percent: number }) => void
    handler({ percent: 42.5 })
    expect(deps.sendToAllWindows).toHaveBeenCalledWith('updater:status', {
      state: 'downloading',
      percent: 42.5,
    })
  })

  it('forwards error as status', () => {
    const deps = makeDeps()
    initUpdater(deps)
    const handler = (mockAutoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'error'
    )![1] as (err: Error) => void
    handler(new Error('network fail'))
    expect(deps.sendToAllWindows).toHaveBeenCalledWith('updater:status', {
      state: 'error',
      message: 'network fail',
    })
  })
})
```

- [ ] **步骤 2: 运行测试确认失败**

执行: `npx vitest run test/updater.test.ts`
预期: 失败 — `../src/main/updater` 模块不存在

- [ ] **步骤 3: 实现 `updater.ts`**

```ts
// src/main/updater.ts
import { autoUpdater } from 'electron-updater'
import { IPC } from '../shared/ipc'
import type { UpdateStatus } from '../shared/updaterTypes'

export interface UpdaterDeps {
  handle(channel: string, fn: (...args: unknown[]) => unknown): void
  sendToAllWindows(channel: string, payload: UpdateStatus): void
}

export interface UpdaterActions {
  checkForUpdates(): Promise<void>
}

export function initUpdater(deps: UpdaterDeps): UpdaterActions {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  function send(status: UpdateStatus): void {
    deps.sendToAllWindows(IPC.updaterStatus, status)
  }

  autoUpdater.on('update-available', (info) => {
    send({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (info) => {
    send({ state: 'downloading', percent: info.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    send({ state: 'error', message: err.message })
  })

  async function checkForUpdates(): Promise<void> {
    send({ state: 'checking' })
    await autoUpdater.checkForUpdates()
  }

  deps.handle(IPC.updaterCheck, () => checkForUpdates())

  deps.handle(IPC.updaterDownload, async () => {
    await autoUpdater.downloadUpdate()
  })

  deps.handle(IPC.updaterInstall, () => {
    send({ state: 'installing' })
    autoUpdater.quitAndInstall()
  })

  return { checkForUpdates }
}
```

- [ ] **步骤 4: 运行测试确认通过**

执行: `npx vitest run test/updater.test.ts`
预期: 全部通过

- [ ] **步骤 5: 运行完整测试套件**

执行: `npm test`
预期: 全部通过

- [ ] **步骤 6: 提交**

```bash
git add test/updater.test.ts src/main/updater.ts
git commit -m "feat(updater): main-process updater module with TDD"
```

---

### Task 4: 安装 electron-updater 依赖

**文件：**
- 修改: `package.json`

- [ ] **步骤 1: 安装 electron-updater 为生产依赖**

执行: `npm install electron-updater`

electron-updater 必须作为生产依赖（而非 devDependency），因为它在打包后的应用主进程中运行。

- [ ] **步骤 2: 在 `package.json` 的 build 配置中添加 publish 信息**

在 `package.json` 的 `"build"` 对象内添加：

```json
"publish": {
  "provider": "github",
  "owner": "jianjustin",
  "repo": "margin"
}
```

- [ ] **步骤 3: 验证测试仍然通过**

执行: `npm test`
预期: 全部通过

- [ ] **步骤 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "build(deps): add electron-updater; configure GitHub publish"
```

---

### Task 5: 将 updater 接入主进程并添加应用菜单

**文件：**
- 修改: `src/main/index.ts`

- [ ] **步骤 1: 添加 import**

在 `src/main/index.ts` 顶部添加以下导入（替换原有的 `import { app, BrowserWindow, ipcMain, dialog } from 'electron'`）：

```ts
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { initUpdater } from './updater'
```

- [ ] **步骤 2: 在 `whenReady` 中初始化 updater 并构建 macOS 应用菜单**

在 `app.whenReady().then(...)` 内部，`registerIpcHandlers(...)` 之后、`createWindow()` 之前，添加：

```ts
  const updaterActions = initUpdater({
    handle: (channel, fn) => ipcMain.handle(channel, fn),
    sendToAllWindows: (channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload)
      }
    },
  })

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '检查更新…',
          click: () => { updaterActions.checkForUpdates() },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
```

- [ ] **步骤 3: 验证类型检查通过**

执行: `npm run typecheck:node`
预期: 通过

- [ ] **步骤 4: 提交**

```bash
git add src/main/index.ts
git commit -m "feat(updater): wire updater into main process; add macOS app menu"
```

---

### Task 6: Preload — 暴露 updater API

**文件：**
- 修改: `src/preload/index.ts`

- [ ] **步骤 1: 在 preload 中添加 updater API**

在 `src/preload/index.ts` 中添加 `UpdaterApi` 的导入：

```ts
import { IPC, type MarginApi, type UpdaterApi } from '../shared/ipc'
```

然后在现有 `api` 常量之后添加 updater 对象：

```ts
const updater: UpdaterApi = {
  check: () => ipcRenderer.invoke(IPC.updaterCheck),
  download: () => ipcRenderer.invoke(IPC.updaterDownload),
  install: () => ipcRenderer.invoke(IPC.updaterInstall),
  onStatus: (callback) => {
    const listener = (_e: unknown, status: import('../shared/updaterTypes').UpdateStatus): void =>
      callback(status)
    ipcRenderer.on(IPC.updaterStatus, listener)
    return () => ipcRenderer.removeListener(IPC.updaterStatus, listener)
  },
}
```

- [ ] **步骤 2: 将 updater 挂载到 `window.margin`**

修改 `contextBridge.exposeInMainWorld` 调用为：

```ts
contextBridge.exposeInMainWorld('margin', { ...api, updater })
```

- [ ] **步骤 3: 更新 `env.d.ts`，在 Window 类型上添加 `UpdaterApi`**

将 `src/renderer/src/env.d.ts` 更新为：

```ts
/// <reference types="vite/client" />
import type { MarginApi, UpdaterApi } from '../../shared/ipc'

declare global {
  interface Window {
    margin: MarginApi & { updater: UpdaterApi }
  }
}

export {}
```

- [ ] **步骤 4: 验证类型检查通过**

执行: `npm run typecheck`
预期: 通过

- [ ] **步骤 5: 提交**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(updater): expose updater API via preload"
```

---

### Task 7: `useUpdater` hook — 测试先行

**文件：**
- 新建: `test/useUpdater-dom.test.tsx`
- 新建: `src/renderer/src/hooks/useUpdater.ts`

- [ ] **步骤 1: 编写 `useUpdater` 的失败测试**

```tsx
// test/useUpdater-dom.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { UpdateStatus } from '../src/shared/updaterTypes'

let statusCallback: ((status: UpdateStatus) => void) | null = null
const unsubscribe = vi.fn()

const mockUpdater = {
  check: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(undefined),
  install: vi.fn().mockResolvedValue(undefined),
  onStatus: vi.fn((cb: (status: UpdateStatus) => void) => {
    statusCallback = cb
    return unsubscribe
  }),
}

vi.stubGlobal('window', {
  ...globalThis.window,
  margin: { updater: mockUpdater },
})

import { useUpdater } from '../src/renderer/src/hooks/useUpdater'

describe('useUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statusCallback = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with idle state', () => {
    const { result } = renderHook(() => useUpdater())
    expect(result.current.status).toEqual({ state: 'idle' })
  })

  it('subscribes to onStatus on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useUpdater())
    expect(mockUpdater.onStatus).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('updates status when onStatus fires', () => {
    const { result } = renderHook(() => useUpdater())
    act(() => {
      statusCallback!({ state: 'available', version: '3.0.0' })
    })
    expect(result.current.status).toEqual({ state: 'available', version: '3.0.0' })
  })

  it('auto-resets not-available to idle after timeout', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useUpdater())
    act(() => {
      statusCallback!({ state: 'not-available' })
    })
    expect(result.current.status).toEqual({ state: 'not-available' })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.status).toEqual({ state: 'idle' })
    vi.useRealTimers()
  })

  it('check() calls window.margin.updater.check', () => {
    const { result } = renderHook(() => useUpdater())
    result.current.check()
    expect(mockUpdater.check).toHaveBeenCalled()
  })

  it('download() calls window.margin.updater.download', () => {
    const { result } = renderHook(() => useUpdater())
    result.current.download()
    expect(mockUpdater.download).toHaveBeenCalled()
  })

  it('install() calls window.margin.updater.install', () => {
    const { result } = renderHook(() => useUpdater())
    result.current.install()
    expect(mockUpdater.install).toHaveBeenCalled()
  })
})
```

- [ ] **步骤 2: 运行测试确认失败**

执行: `npx vitest run test/useUpdater-dom.test.tsx`
预期: 失败 — 模块不存在

- [ ] **步骤 3: 实现 `useUpdater` hook**

```ts
// src/renderer/src/hooks/useUpdater.ts
import { useEffect, useRef, useState } from 'react'
import type { UpdateStatus } from '../../../shared/updaterTypes'

const IDLE: UpdateStatus = { state: 'idle' }

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>(IDLE)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = window.margin.updater.onStatus((s) => {
      if (timerRef.current) clearTimeout(timerRef.current)

      setStatus(s)

      if (s.state === 'not-available') {
        timerRef.current = setTimeout(() => setStatus(IDLE), 2000)
      }
    })
    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    status,
    check: () => window.margin.updater.check(),
    download: () => window.margin.updater.download(),
    install: () => window.margin.updater.install(),
  }
}
```

- [ ] **步骤 4: 运行测试确认通过**

执行: `npx vitest run test/useUpdater-dom.test.tsx`
预期: 全部通过

- [ ] **步骤 5: 提交**

```bash
git add test/useUpdater-dom.test.tsx src/renderer/src/hooks/useUpdater.ts
git commit -m "feat(updater): useUpdater hook with TDD"
```

---

### Task 8: `UpdateBanner` 组件

**文件：**
- 新建: `src/renderer/src/components/UpdateBanner.tsx`

- [ ] **步骤 1: 创建 `UpdateBanner` 组件**

```tsx
// src/renderer/src/components/UpdateBanner.tsx
import type { UpdateStatus } from '../../../shared/updaterTypes'

interface UpdateBannerProps {
  status: UpdateStatus
  onDownload: () => void
  onInstall: () => void
  onRetry: () => void
}

export function UpdateBanner({
  status,
  onDownload,
  onInstall,
  onRetry,
}: UpdateBannerProps): JSX.Element | null {
  if (status.state === 'idle' || status.state === 'installing') return null

  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-3 bg-[color:var(--accent)] px-4 text-xs font-medium text-white">
      {status.state === 'checking' && (
        <span>正在检查更新…</span>
      )}

      {status.state === 'available' && (
        <>
          <span>新版本 v{status.version} 可用</span>
          <button
            onClick={onDownload}
            className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            下载更新
          </button>
        </>
      )}

      {status.state === 'not-available' && (
        <span>已是最新版本</span>
      )}

      {status.state === 'downloading' && (
        <>
          <span>正在下载… {Math.round(status.percent)}%</span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-200"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        </>
      )}

      {status.state === 'ready' && (
        <>
          <span>v{status.version} 已下载完成</span>
          <button
            onClick={onInstall}
            className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            安装并重启
          </button>
        </>
      )}

      {status.state === 'error' && (
        <>
          <span>更新失败: {status.message}</span>
          <button
            onClick={onRetry}
            className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            重试
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **步骤 2: 验证类型检查通过**

执行: `npm run typecheck:web`
预期: 通过

- [ ] **步骤 3: 提交**

```bash
git add src/renderer/src/components/UpdateBanner.tsx
git commit -m "feat(updater): UpdateBanner component"
```

---

### Task 9: 在 App 中挂载 `UpdateBanner`

**文件：**
- 修改: `src/renderer/src/App.tsx`

- [ ] **步骤 1: 添加 import**

在 `src/renderer/src/App.tsx` 中添加以下导入：

```ts
import { UpdateBanner } from '@/components/UpdateBanner'
import { useUpdater } from '@/hooks/useUpdater'
```

- [ ] **步骤 2: 在 `App` 组件中调用 `useUpdater`**

在 `App` 函数内，现有 hooks 之后（`useVaultWatch()` 之后），添加：

```ts
  const updater = useUpdater()
```

- [ ] **步骤 3: 渲染 `UpdateBanner`**

在 JSX 中，紧接着外层 `<div className="flex h-screen flex-col ...">` 之后、`<header>` 之前，添加：

```tsx
      <UpdateBanner
        status={updater.status}
        onDownload={updater.download}
        onInstall={updater.install}
        onRetry={updater.check}
      />
```

- [ ] **步骤 4: 验证类型检查通过**

执行: `npm run typecheck:web`
预期: 通过

- [ ] **步骤 5: 运行完整测试套件**

执行: `npm test`
预期: 全部通过

- [ ] **步骤 6: 提交**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(updater): mount UpdateBanner in App"
```

---

### Task 10: 开发模式手动验证

- [ ] **步骤 1: 启动开发服务器**

执行: `npm run dev`

- [ ] **步骤 2: 验证应用菜单**

检查 macOS 菜单栏是否显示"Margin"，其下是否包含"检查更新…"菜单项。

- [ ] **步骤 3: 点击"检查更新…"并验证 banner 出现**

点击该菜单项。`UpdateBanner` 应在顶部出现，显示"正在检查更新…"。由于 GitHub 上没有更新的版本，预期会转为"已是最新版本"（2秒后自动消失）或 error 状态（开发模式下没有打包上下文属于正常现象）。

- [ ] **步骤 4: 验证无回归问题**

- 侧边栏切换（⌘B）仍正常
- 文件编辑和自动保存仍正常
- 底部状态栏仍显示统计信息
- 大纲抽屉（⌘\）仍正常

- [ ] **步骤 5: 如有调整则最终提交**

```bash
git add -A
git commit -m "fix(updater): adjustments from manual verification"
```
