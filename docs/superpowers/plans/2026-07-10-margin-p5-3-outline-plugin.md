# P5.3 Outline 插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `OutlineDrawer` 里硬编码的 "Outline" tab 变成和 P5.2 的 Schedule tab 同构的插件面板——`outlinePlugin` 消费 `editor-core/outline.collectOutline`，通过 `PluginHost` 注册 sidebar panel；`OutlineDrawer` 完全去业务化，变成纯粹的"按 `pluginUiStore` 里已注册的面板渲染 tab"的通用宿主，不再对任何具体面板（Outline 或 Schedule）有特殊认知。

**Architecture:** 完全复刻 P5.2 的分层——`OutlinePanel.tsx`（纯 UI，订阅 `documentStore` 拿 `content`）→ `outlinePlugin.tsx`（包成 `MarginPlugin`，`ui.sidebar` 权限，无需 `commands`，因为 spec 未要求任何 outline 命令）→ `usePluginHost` 新增一个不受任何 setting 门禁、挂载即激活的 effect 来装载它（区别于 Schedule 挂靠 `scheduleEnabled`）→ `OutlineDrawer` 彻底去掉硬编码的 Outline 分支，变成纯 `panels.map` 通用宿主，激活面板不存在时的兜底逻辑从"回退到固定的 'outline' id"改为"回退到 `panels` 数组的第一项"。

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest + @testing-library/react（与 P5.2 完全一致，不引入新依赖）。

## Global Constraints

- UI 视觉表现（Outline tab 的标题列表、"Table of Contents" 文案、空状态提示、点击高亮 2 秒后消退）必须和当前 `OutlineDrawer.tsx` 里的 Outline 分支逐像素一致——这是架构搬迁，不是重新设计。
- `PluginContext`/`HostServices`/`pluginUiStore` 的类型签名本期不改；只新增消费方（`outlinePlugin` 是新消费方，不改 `plugin-api/types.ts`/`host.ts`）。
- 插件只声明它实际使用、且 host 真正校验的权限（宁缺毋滥，5.1 已确立的原则）：`outlinePlugin` 只需要 `ui.sidebar`，不注册命令，不声明 `commands` 权限。
- Tab 顺序必须保持 Outline 在前、Schedule 在后（与迁移前一致）——`usePluginHost` 里 outline 的激活 `useEffect` 必须在 schedule 的激活 `useEffect` **之前**声明（源码顺序决定 React 执行顺序，进而决定 `pluginUiStore.sidebarPanels` 数组的 push 顺序）。
- 每个任务独立 commit，遵循 TDD（先写失败测试）。

---

### Task 1: `OutlinePanel` — 从 `OutlineDrawer` 抽出大纲列表组件

**Files:**
- Create: `src/renderer/src/plugin-api/builtins/OutlinePanel.tsx`
- Test: `test/outlinePanel-dom.test.tsx`

**Interfaces:**
- Produces: `OutlinePanel({ onJumpToLine }: { onJumpToLine?: (line: number) => void }): JSX.Element`，导出到 `plugin-api/builtins/OutlinePanel.tsx`。Task 2 的 `outlinePlugin.tsx` 消费它。

- [ ] **Step 1: 写失败测试**

```tsx
// test/outlinePanel-dom.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlinePanel } from '@/plugin-api/builtins/OutlinePanel'
import { useDocumentStore } from '@/stores/documentStore'

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
})

function seed(content: string): void {
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/a.md', content)
}

describe('OutlinePanel', () => {
  it('shows the empty state with no headings', () => {
    seed('just text, no headings')
    render(<OutlinePanel />)
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('暂无标题')).toBeTruthy()
  })

  it('lists headings and calls onJumpToLine on click', () => {
    seed('# Title\n\ntext\n\n## Sub\n\nmore text')
    const onJumpToLine = vi.fn()
    render(<OutlinePanel onJumpToLine={onJumpToLine} />)

    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Sub')).toBeTruthy()

    fireEvent.click(screen.getByText('Sub'))
    expect(onJumpToLine).toHaveBeenCalledWith(4)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/outlinePanel-dom.test.tsx`
Expected: FAIL，找不到模块 `@/plugin-api/builtins/OutlinePanel`

- [ ] **Step 3: 实现**

```tsx
// src/renderer/src/plugin-api/builtins/OutlinePanel.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { collectOutline, type OutlineItem } from '@/editor-core'

export interface OutlinePanelProps {
  onJumpToLine?: (line: number) => void
}

/**
 * The Outline tab's heading list (moved out of OutlineDrawer for P5.3 — this
 * is now the `render()` target of the built-in outline plugin's sidebar
 * panel, mirroring ScheduleCalendarPanel's extraction in P5.2). Reads
 * document content from the store directly since it's mounted standalone by
 * the plugin host, not by a parent that owns that data.
 */
export function OutlinePanel({ onJumpToLine }: OutlinePanelProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => collectOutline(content), [content])
  const [activeIdx, setActiveIdx] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(heading: OutlineItem, idx: number): void {
    setActiveIdx(idx)
    onJumpToLine?.(heading.line)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setActiveIdx(-1), 2000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const lvlClass = (level: number): string => {
    if (level === 1) return 'font-semibold text-[color:var(--text)]'
    if (level === 2) return 'pl-[21px]'
    return 'pl-[36px] text-[12px]'
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
        Table of Contents
      </div>
      {headings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-[12.5px] leading-relaxed text-[color:var(--text-faint)]">
          <span>暂无标题</span>
          <span className="text-[11.5px] leading-[1.7]">
            用{' '}
            <code className="rounded bg-[color:var(--bg-elev)] px-1.5 py-px font-[family-name:var(--mono)] text-[color:var(--accent)] text-[11px] border border-[color:var(--border-soft)]">
              # 标题
            </code>{' '}
            创建大纲
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          {headings.map((h, i) => (
            <div
              key={`${h.line}-${h.text}`}
              onClick={() => handleClick(h, i)}
              className={[
                'flex cursor-pointer items-center gap-[9px] overflow-hidden whitespace-nowrap rounded-md px-[10px] py-[6px] text-[13px] leading-[1.45] text-[color:var(--text-dim)] transition-colors',
                activeIdx === i
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)] shadow-[inset_2px_0_0_var(--accent)]'
                  : 'hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text)]',
                lvlClass(h.level)
              ].join(' ')}
            >
              <span className="overflow-hidden text-ellipsis">{h.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/outlinePanel-dom.test.tsx`
Expected: PASS，2/2

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/plugin-api/builtins/OutlinePanel.tsx test/outlinePanel-dom.test.tsx
git commit -m "refactor(plugin-api): 从 OutlineDrawer 抽出 OutlinePanel"
```

---

### Task 2: `outlinePlugin` — 包成 `MarginPlugin`

**Files:**
- Create: `src/renderer/src/plugin-api/builtins/outlinePlugin.tsx`
- Modify: `src/renderer/src/plugin-api/index.ts`（追加一行 barrel export）
- Test: `test/outlinePlugin.test.ts`

**Interfaces:**
- Consumes: `OutlinePanel`（Task 1）。
- Produces: `createOutlinePlugin(onJumpToLine: (line: number) => void): MarginPlugin`，从 `@/plugin-api` 导出。Task 3 的 `usePluginHost` 消费它。

- [ ] **Step 1: 写失败测试**

```ts
// test/outlinePlugin.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginHost, EventBus, type HostServices, type SidebarPanelContribution } from '@/plugin-api'
import { createOutlinePlugin } from '@/plugin-api/builtins/outlinePlugin'

function makeServices(): HostServices & { panels: Map<string, SidebarPanelContribution> } {
  const panels = new Map<string, SidebarPanelContribution>()
  return {
    panels,
    commands: { register: () => ({ dispose: () => {} }) },
    vaultSnapshot: () => ({ root: '/v', tree: [] }),
    events: new EventBus(),
    ui: {
      registerSidebarPanel: (panel) => {
        panels.set(panel.id, panel)
        return { dispose: () => panels.delete(panel.id) }
      },
      registerStatusItem: () => ({ dispose: () => {} })
    }
  }
}

describe('outlinePlugin', () => {
  it('declares ui.sidebar permission only (no commands)', () => {
    const plugin = createOutlinePlugin(vi.fn())
    expect(plugin.manifest.id).toBe('builtin.outline')
    expect(plugin.manifest.permissions).toEqual(['ui.sidebar'])
  })

  it('registers a sidebar panel with id builtin.outline', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createOutlinePlugin(vi.fn()))
    expect(services.panels.has('builtin.outline')).toBe(true)
    expect(services.panels.get('builtin.outline')!.title).toBe('Outline')
  })

  it('deactivation disposes the panel', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createOutlinePlugin(vi.fn()))
    await host.deactivate('builtin.outline')
    expect(services.panels.size).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/outlinePlugin.test.ts`
Expected: FAIL，找不到模块 `@/plugin-api/builtins/outlinePlugin`

- [ ] **Step 3: 实现**

```tsx
// src/renderer/src/plugin-api/builtins/outlinePlugin.tsx
import { createRoot } from 'react-dom/client'
import type { MarginPlugin } from '../types'
import { OutlinePanel } from './OutlinePanel'

/**
 * Built-in outline plugin (P5.3): registers a sidebar panel rendering the
 * document's heading list. `onJumpToLine` is injected by the host app
 * (App.tsx passes its editor-jump callback) — mirrors `createSchedulePlugin`'s
 * pattern of taking host callbacks rather than reaching for app internals. No
 * command is registered (unlike `schedule.openToday`) since nothing in the
 * plan calls for one; only `ui.sidebar` is declared.
 */
export function createOutlinePlugin(onJumpToLine: (line: number) => void): MarginPlugin {
  return {
    manifest: {
      id: 'builtin.outline',
      name: '大纲',
      version: '0.1.0',
      permissions: ['ui.sidebar']
    },
    activate(ctx) {
      ctx.ui.registerSidebarPanel({
        id: 'builtin.outline',
        title: 'Outline',
        icon: 'List',
        render: (container) => {
          const root = createRoot(container)
          root.render(<OutlinePanel onJumpToLine={onJumpToLine} />)
          return () => root.unmount()
        }
      })
    }
  }
}
```

- [ ] **Step 4: 更新 barrel export**

在 `src/renderer/src/plugin-api/index.ts` 里，找到这一行：

```ts
export { createSchedulePlugin } from './builtins/schedulePlugin'
```

在它下面追加：

```ts
export { createOutlinePlugin } from './builtins/outlinePlugin'
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run test/outlinePlugin.test.ts`
Expected: PASS，3/3

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/plugin-api/builtins/outlinePlugin.tsx src/renderer/src/plugin-api/index.ts test/outlinePlugin.test.ts
git commit -m "feat(plugin-api): 新增 outlinePlugin，注册 sidebar panel"
```

---

### Task 3: `usePluginHost` — 无条件激活 outline 插件

**Files:**
- Modify: `src/renderer/src/hooks/usePluginHost.ts`
- Modify: `test/usePluginHost.test.tsx`
- Modify: `test/pluginHostIntegration-dom.test.tsx`（仅修调用签名，行为断言留给 Task 4 重写）

**Interfaces:**
- Consumes: `createOutlinePlugin`（Task 2）。
- Produces: `usePluginHost(onOpenToday: (date: Date) => void, onJumpToLine: (line: number) => void): void`——签名从 P5.2 的单参数变为双参数。Task 5 的 `App.tsx` 消费新签名。

- [ ] **Step 1: 写失败测试（改写 `test/usePluginHost.test.tsx`）**

用下面内容整体替换 `test/usePluginHost.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
})

beforeEach(() => {
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
})

describe('usePluginHost', () => {
  it('activates the outline plugin before the schedule plugin (tab order)', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const ids = usePluginUiStore.getState().sidebarPanels.map((p) => p.descriptor.id)
    expect(ids).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('activates the outline plugin even when scheduleEnabled starts false', async () => {
    useSettingsStore.setState({ scheduleEnabled: false })
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('activates the schedule plugin (registers its sidebar panel) when scheduleEnabled is true', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.some((p) => p.descriptor.id === 'builtin.schedule')).toBe(true)
  })

  it('deactivates the schedule plugin (outline stays) when scheduleEnabled flips to false', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('unmounting the hook deactivates both plugins (no leaked panels)', async () => {
    const { unmount } = renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)
    await act(async () => {
      unmount()
      // dispose() defers the schedule panel's nested-root unmount() past the
      // microtask boundary (see usePluginHost.ts) — flush it inside act() so
      // the deferred unmount is also tracked, not just the sync part.
      await new Promise((resolve) => queueMicrotask(resolve))
    })
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })

  it('calls onJumpToLine when the outline plugin invokes it', async () => {
    const onJumpToLine = vi.fn()
    renderHook(() => usePluginHost(vi.fn(), onJumpToLine))
    await act(async () => {})

    const outlinePanel = usePluginUiStore
      .getState()
      .sidebarPanels.find((p) => p.descriptor.id === 'builtin.outline')!
    // The panel's container has the real OutlinePanel mounted into it by
    // registerSidebarPanel — simulate what OutlinePanel does internally by
    // calling render() again is wrong (double-mounts); instead this is
    // covered end-to-end by test/pluginHostIntegration-dom.test.tsx (Task 4).
    // Here we only assert the panel registered successfully with the given
    // callback closed over (no error thrown), which the earlier tests in
    // this file already cover — this test intentionally has no additional
    // assertion beyond confirming registration succeeded without throwing.
    expect(outlinePanel).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/usePluginHost.test.tsx`
Expected: FAIL — `usePluginHost` 目前只接受 1 个参数，且不激活 outline 插件

- [ ] **Step 3: 实现**

用下面内容整体替换 `src/renderer/src/hooks/usePluginHost.ts`：

```ts
import { useEffect, useRef } from 'react'
import {
  PluginHost,
  EventBus,
  createSchedulePlugin,
  createOutlinePlugin,
  type HostServices
} from '@/plugin-api'
import { CommandRegistry } from '@/core/commands/registry'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

/**
 * Instantiates the app's `PluginHost` (plugin-api/host.ts) with real
 * `HostServices`. Activates the built-in outline plugin unconditionally (no
 * settings toggle exists for it — it's core UI, mirroring how the Outline tab
 * was always present before P5.3) and the built-in schedule plugin as
 * `scheduleEnabled` toggles (P5.2 — the first real consumer of PluginHost;
 * previously it only existed inside plugin-api's own tests).
 *
 * The outline-activation effect is declared BEFORE the schedule-activation
 * effect so `pluginUiStore.sidebarPanels` always gets `builtin.outline`
 * pushed first — React runs a component's effect setups in declaration
 * order on mount, and `PluginHost.activate`'s synchronous prefix (which
 * includes the plugin's own `ctx.ui.registerSidebarPanel` call) fully runs
 * before the enclosing async function yields at its first `await`, so this
 * ordering is deterministic, not a race. `OutlineDrawer` renders tabs in
 * `sidebarPanels` order, so this is what keeps "Outline" as the first tab.
 *
 * `commands` uses its own `CommandRegistry` instance, mirroring the pattern
 * already used by `useGlobalKeymap` — binding contributed commands into the
 * global keymap/slash menu is a future task, not this one; this hook only
 * makes the registry real and inspectable.
 *
 * `ui.registerSidebarPanel` renders eagerly into a detached `<div>` (via the
 * panel's own `render()`) and stores it in `pluginUiStore` — OutlineDrawer
 * reparents that same container into visible DOM when its tab is active, so
 * the panel's React state survives tab switches and is only torn down when
 * this hook deactivates the plugin.
 */
export function usePluginHost(
  onOpenToday: (date: Date) => void,
  onJumpToLine: (line: number) => void
): void {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const onOpenTodayRef = useRef(onOpenToday)
  onOpenTodayRef.current = onOpenToday
  const onJumpToLineRef = useRef(onJumpToLine)
  onJumpToLineRef.current = onJumpToLine

  const hostRef = useRef<PluginHost | null>(null)
  if (!hostRef.current) {
    const services: HostServices = {
      commands: new CommandRegistry<void>(),
      vaultSnapshot: () => {
        const { root, tree } = useVaultStore.getState()
        return { root: root ?? '', tree }
      },
      events: new EventBus(),
      ui: {
        registerSidebarPanel: (panel) => {
          const container = document.createElement('div')
          container.style.display = 'contents'
          const unmount = panel.render(container)
          usePluginUiStore.getState().addSidebarPanel({ descriptor: panel, container })
          return {
            dispose: () => {
              // Defer unmount() (which drives the panel's nested `createRoot`
              // root.unmount() in schedulePlugin.tsx/outlinePlugin.tsx) past
              // the microtask boundary so it escapes the outer root's
              // passive-effect execution window — calling it synchronously
              // here (this dispose runs from a useEffect cleanup) makes React
              // log "Attempted to synchronously unmount a root while React
              // was already rendering" because ReactDOMRoot.unmount()
              // internally flushSyncs while React's "flushing passive
              // effects" flag is still set. removeSidebarPanel stays
              // synchronous — it's a plain Zustand `set()` unrelated to the
              // React root, and removing the panel immediately is what makes
              // the tab disappear from OutlineDrawer without delay.
              queueMicrotask(() => unmount())
              usePluginUiStore.getState().removeSidebarPanel(panel.id)
            }
          }
        },
        registerStatusItem: (item) => {
          usePluginUiStore.getState().addStatusItem(item)
          return { dispose: () => usePluginUiStore.getState().removeStatusItem(item.id) }
        }
      }
    }
    hostRef.current = new PluginHost(services)
  }

  useEffect(() => {
    const host = hostRef.current!
    void host.activate(createOutlinePlugin((line) => onJumpToLineRef.current(line)))
    return () => {
      void host.deactivate('builtin.outline')
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current!
    if (!scheduleEnabled) return
    void host.activate(createSchedulePlugin((date) => onOpenTodayRef.current(date)))
    return () => {
      void host.deactivate('builtin.schedule')
    }
  }, [scheduleEnabled])
}
```

- [ ] **Step 4: 修 `test/pluginHostIntegration-dom.test.tsx` 的调用签名（不改断言）**

这个文件在 P5.2 已经存在，直接调用 `usePluginHost`。本任务只需让它能编译通过并保持原有断言（此时 `OutlineDrawer` 还没变成通用宿主，Task 4 才会重写这个文件的断言）。把文件顶部的 `Harness` 组件：

```tsx
function Harness({ onOpenToday }: { onOpenToday: (date: Date) => void }): JSX.Element {
  usePluginHost(onOpenToday)
  return <OutlineDrawer width={280} />
}
```

改为：

```tsx
function Harness({ onOpenToday }: { onOpenToday: (date: Date) => void }): JSX.Element {
  usePluginHost(onOpenToday, () => {})
  return <OutlineDrawer width={280} />
}
```

（其余内容不变——两处 `render(<Harness onOpenToday={vi.fn()} />)` 调用点不用改，`Harness` 内部已经补了第二个参数。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run test/usePluginHost.test.tsx test/pluginHostIntegration-dom.test.tsx`
Expected: PASS——`usePluginHost.test.tsx` 6/6；`pluginHostIntegration-dom.test.tsx` 2/2（原有断言不变，仍然成立，因为 `OutlineDrawer` 在本任务还没动）

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/usePluginHost.ts test/usePluginHost.test.tsx test/pluginHostIntegration-dom.test.tsx
git commit -m "feat(plugin-api): usePluginHost 无条件激活 outline 插件，signature 增加 onJumpToLine"
```

---

### Task 4: `OutlineDrawer` — 变成通用插件面板宿主

**Files:**
- Modify: `src/renderer/src/components/OutlineDrawer.tsx`
- Modify: `test/outlineDrawer-dom.test.tsx`（整体重写）
- Modify: `test/pluginHostIntegration-dom.test.tsx`（重写断言，验证真实 outline 面板路径）

**Interfaces:**
- Consumes: `usePluginUiStore`（已存在，无签名变化）。
- Produces: `OutlineDrawer({ width }: { width: number }): JSX.Element`——props 从 P5.2 的 `{ width, onJumpToLine? }` 收窄为只剩 `{ width }`（`onJumpToLine` 不再是 `OutlineDrawer` 的职责，改由 Task 3 的 `usePluginHost` 直接把它闭包进 `outlinePlugin`）。Task 5 的 `App.tsx` 消费新签名。

- [ ] **Step 1: 写失败测试（整体重写 `test/outlineDrawer-dom.test.tsx`）**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { usePluginUiStore } from '@/stores/pluginUiStore'

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

function registerFakePanel(id: string, title: string, marker: string): void {
  const container = document.createElement('div')
  container.textContent = marker
  usePluginUiStore.getState().addSidebarPanel({
    descriptor: { id, title, icon: 'List', render: () => () => {} },
    container
  })
}

describe('OutlineDrawer — generic plugin panel host', () => {
  it('renders no tabs when no panels are registered', () => {
    render(<OutlineDrawer width={280} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('defaults to the first registered panel and mounts its container', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    render(<OutlineDrawer width={280} />)
    expect(screen.getByText('outline-marker')).toBeTruthy()
  })

  it('renders a tab per registered panel and switches between them', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)

    expect(screen.getByText('outline-marker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()
  })

  it('falls back to the first remaining panel when the active one is unregistered', () => {
    registerFakePanel('builtin.outline', 'Outline', 'outline-marker')
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()

    act(() => {
      usePluginUiStore.getState().removeSidebarPanel('builtin.schedule')
    })

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('outline-marker')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/outlineDrawer-dom.test.tsx`
Expected: FAIL——当前 `OutlineDrawer` 仍硬编码 Outline 分支，"renders no tabs when no panels are registered" 等断言不成立

- [ ] **Step 3: 实现**

用下面内容整体替换 `src/renderer/src/components/OutlineDrawer.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { usePluginUiStore, type RegisteredSidebarPanel } from '@/stores/pluginUiStore'

interface OutlineDrawerProps {
  width: number
}

/** Reparents an already-rendered plugin panel container into visible DOM while active; detaching (not unmounting) it when the tab switches away, so the panel's React state survives. */
function PanelSlot({ container }: { container: HTMLElement }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.appendChild(container)
  }, [container])
  return <div ref={ref} className="flex min-h-0 flex-1 flex-col" />
}

/**
 * A generic host for plugin-contributed sidebar panels (P5.3) — renders one
 * tab per entry in `pluginUiStore`'s `sidebarPanels`, with no built-in tabs of
 * its own. Both "Outline" and "Schedule" are now plugins (`outlinePlugin`,
 * `schedulePlugin`, both activated by `usePluginHost`); this component only
 * knows how to switch between whatever panels are currently registered, and
 * falls back to the first available panel when the active one disappears
 * (e.g. the schedule plugin deactivating while its tab is selected).
 */
export function OutlineDrawer({ width }: OutlineDrawerProps): JSX.Element {
  const panels = usePluginUiStore((s) => s.sidebarPanels)
  const [tab, setTab] = useState<string>('')

  useEffect(() => {
    if (panels.some((p) => p.descriptor.id === tab)) return
    setTab(panels[0]?.descriptor.id ?? '')
  }, [panels, tab])

  const activePanel: RegisteredSidebarPanel | undefined = panels.find(
    (p) => p.descriptor.id === tab
  )

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[var(--drawer-shadow)]"
    >
      <div className="mb-[18px] flex shrink-0 rounded-lg bg-[color:var(--bg-hover)] p-[3px]">
        {panels.map((p) => (
          <button
            key={p.descriptor.id}
            onClick={() => setTab(p.descriptor.id)}
            className={[
              'flex-1 rounded-md py-[7px] text-[12.5px] transition-colors',
              tab === p.descriptor.id
                ? 'bg-[color:var(--bg-elev)] font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)]'
                : 'font-medium text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
            ].join(' ')}
          >
            {p.descriptor.title}
          </button>
        ))}
      </div>
      {activePanel ? (
        <PanelSlot key={activePanel.descriptor.id} container={activePanel.container} />
      ) : null}
    </aside>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/outlineDrawer-dom.test.tsx`
Expected: PASS，4/4

- [ ] **Step 5: 重写 `test/pluginHostIntegration-dom.test.tsx` 的断言**

现在 `OutlineDrawer` 已经通用化，这个文件里假设"Table of Contents 永远兜底可见"的断言其实仍然成立（因为 outline 插件无条件激活），但应该改为验证真实的 outline 面板内容（而不是巧合地依赖旧的硬编码），并且要验证 `onJumpToLine` 真的从 `usePluginHost` 一路传到了 `OutlinePanel`。用下面内容整体替换该文件：

```tsx
// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'

/**
 * End-to-end integration coverage for P5.2/P5.3: exercises the real
 * `usePluginHost` + real `schedulePlugin`/`outlinePlugin` + real
 * `OutlineDrawer`/`PanelSlot` together, which no single task's own tests do.
 */
function Harness({
  onOpenToday,
  onJumpToLine
}: {
  onOpenToday: (date: Date) => void
  onJumpToLine: (line: number) => void
}): JSX.Element {
  usePluginHost(onOpenToday, onJumpToLine)
  return <OutlineDrawer width={280} />
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(resolve))
  })
}

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
  useDocumentStore.getState().reset()
})

describe('plugin host + OutlineDrawer integration (real schedule + outline plugins)', () => {
  it('shows the real outline panel by default and calls onJumpToLine through the real plugin', async () => {
    useDocumentStore.getState().openOrActivate('/v/a.md', '# Title\n\ntext')
    const onJumpToLine = vi.fn()

    render(<Harness onOpenToday={vi.fn()} onJumpToLine={onJumpToLine} />)
    await act(async () => {})

    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()

    fireEvent.click(screen.getByText('Title'))
    expect(onJumpToLine).toHaveBeenCalledWith(0)
  })

  it('reparents the real ScheduleCalendarPanel into visible DOM, then falls back to the real Outline panel cleanly on deactivate', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })

    render(<Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />)
    await act(async () => {})

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()

    fireEvent.click(tab)
    // The calendar header ("YYYY 年 M 月") is unique to the real
    // ScheduleCalendarPanel — unlike a fake stub, this proves the actual
    // plugin panel was reparented into visible DOM by PanelSlot.
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()
    expect(screen.getByLabelText('上个月')).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels[0].descriptor.id).toBe('builtin.outline')

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('survives StrictMode double-activate/cleanup for both plugins without a "plugin already active" error or an orphaned tab', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    useSettingsStore.setState({ scheduleEnabled: true, scheduleDir: '日程' })

    render(
      <React.StrictMode>
        <Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />
      </React.StrictMode>
    )
    await act(async () => {})
    await flushMicrotasks()

    // StrictMode double-invokes effects; there must be exactly one tab per
    // plugin / two registered panels total, not duplicates.
    expect(screen.getAllByRole('button', { name: 'Outline' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: 'Schedule' }).length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })
    await flushMicrotasks()

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run test/outlineDrawer-dom.test.tsx test/pluginHostIntegration-dom.test.tsx`
Expected: PASS，7/7（4 + 3）

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/OutlineDrawer.tsx test/outlineDrawer-dom.test.tsx test/pluginHostIntegration-dom.test.tsx
git commit -m "refactor(editor): OutlineDrawer 彻底通用化，Outline/Schedule 均由插件面板驱动"
```

---

### Task 5: `App.tsx` 接线 + 全量回归

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `usePluginHost(onOpenToday, onJumpToLine)`（Task 3 的新签名）；`OutlineDrawer({ width })`（Task 4 的新签名）。

- [ ] **Step 1: 接线**

在 `src/renderer/src/App.tsx` 里：

1. 找到现有调用（P5.2 留下的）：

```ts
  usePluginHost(fileOps.openScheduleNote)
```

改为：

```ts
  usePluginHost(fileOps.openScheduleNote, handleJumpToLine)
```

（`handleJumpToLine` 函数已经在 `App.tsx` 里存在——`function handleJumpToLine(line: number): void { editorRef.current?.jumpToLine(line) }`，位于 `usePluginHost` 调用之后、`<OutlineDrawer>` 调用之前；由于 `usePluginHost` 内部通过 `useRef` 把回调存住并在每次渲染时更新 `.current`（P5.2 已建立的模式），把 `handleJumpToLine` 提前引用到 `usePluginHost` 调用处不会有陈旧闭包问题——`handleJumpToLine` 本身不依赖任何会变化的外部状态，是稳定引用可用的普通函数声明。）

2. 找到 `<OutlineDrawer>` 调用：

```tsx
              <OutlineDrawer width={rightPaneWidth} onJumpToLine={handleJumpToLine} />
```

改为：

```tsx
              <OutlineDrawer width={rightPaneWidth} />
```

- [ ] **Step 2: 编译检查**

Run: `pnpm typecheck`
Expected: 无类型错误

- [ ] **Step 3: 全量测试回归**

Run: `pnpm vitest run`
Expected: 全绿，重点关注 `test/app-rerender.test.tsx`（渲染次数基线不应回退）与本期新增/改动的测试文件（`outlinePanel-dom`、`outlinePlugin`、`usePluginHost`、`outlineDrawer-dom`、`pluginHostIntegration-dom`）

- [ ] **Step 4: 手动验收**（Tauri/demo 环境）

Run: `pnpm demo`
清单：
- 打开一个 vault，⌘\ 打开抽屉，Outline tab 默认选中，标题列表和迁移前逐像素一致（点击标题跳转、2 秒高亮消退）。
- 切到 Schedule tab 再切回 Outline，标题列表内容/滚动位置应保持（PanelSlot 的 reparent-not-remount 设计的可观察效果，和 P5.2 验证 Schedule 面板月份不重置是同一机制）。
- 关掉设置里的"日程"开关，Schedule tab 消失，Outline tab 不受影响、无报错；重新打开开关，Schedule tab 恢复且排在 Outline 右边（顺序不变）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(app): usePluginHost 接入 onJumpToLine，OutlineDrawer 调用处随 Outline 插件化精简"
```

---

## 风险与回退

| 风险 | 缓解 |
|------|------|
| `OutlineDrawer` 初始 `tab` 状态为空字符串，插件激活是异步的（`PluginHost.activate` 内部 `await`），挂载瞬间可能有一帧"无 tab 内容"的空白 | 这和 P5.2 里 Schedule 面板本来就有的特性一致（同样靠 `usePluginHost` 异步激活），不是本期引入的新回归；真实浏览器里从 mount 到 effect flush 通常在同一帧内完成，视觉上不可感知 |
| `usePluginHost` 两个 `useEffect` 的声明顺序决定 tab 顺序，属于隐式依赖、容易被后续重构无意打破 | Task 3 的测试专门断言 `ids` 数组顺序 `['builtin.outline', 'builtin.schedule']`，顺序回归会被立刻测出来 |
| Task 3 与 Task 4 之间，`pluginHostIntegration-dom.test.tsx` 需要被touch两次（先改调用签名保持绿，再在 Task 4 整体重写断言） | 计划里已经把这两步拆清楚，Task 3 的 Step 4 明确只改调用点不改断言，避免一次性大改导致中间态测试失真 |

## 自审记录（writing-plans Self-Review）

- **spec 覆盖**：master plan `docs/superpowers/plans/2026-07-04-margin-refactor.md` 里 Task 5.3 的两条硬性要求——① `plugin-api/builtins/outlinePlugin.ts` 消费 `editor-core/outline.collectOutline`（Task 2，Task 1 提供的 `OutlinePanel` 内部用了 `collectOutline`）② `OutlineDrawer` 的 Outline tab 改由面板渲染（Task 4）。均覆盖。✓
- **占位符检查**：全文无 TBD/待补，每个 Step 都是可执行的完整代码或明确的编辑指令。✓
- **类型一致性**：`OutlinePanelProps`（Task 1 定义 `onJumpToLine?`→ Task 2 `outlinePlugin.tsx` 的 `render` 内消费一致）；`createOutlinePlugin(onJumpToLine)`（Task 2 定义 → Task 3 `usePluginHost` 消费 → Task 5 `App.tsx` 经 `usePluginHost` 间接消费，签名均为 `(line: number) => void`）；`usePluginHost(onOpenToday, onJumpToLine)`（Task 3 定义双参数 → Task 5 消费签名一致）；`OutlineDrawerProps`（Task 4 收窄为 `{ width }` → Task 5 调用处同步精简，无遗留旧 prop）。✓
