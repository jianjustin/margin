# P5.2 Schedule 内置插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 OutlineDrawer 的 Schedule tab 从硬编码 React 分支改为由 `plugin-api` 的 `PluginHost` 驱动的内置插件面板，同时把 `PluginHost` 第一次真正接入 App（此前只在 `plugin-api` 内部和测试里存在）。

**Architecture:** 日历 UI 从 `OutlineDrawer.tsx` 抽出为独立组件 `ScheduleCalendarPanel`；新建 `schedulePlugin.ts` 把它包成 `MarginPlugin`（注册 `schedule.openToday` 命令 + 一个 sidebar panel）；新建 `pluginUiStore` 作为真实 `UiSink` 的落地存储；新建 `usePluginHost` hook 在 App 里实例化 `PluginHost`，按 `scheduleEnabled` 设置激活/停用 schedule 插件；`OutlineDrawer` 改为把 `pluginUiStore` 里已注册的 sidebar panel 渲染成动态 tab（`registerSidebarPanel` 在注册时立即把面板渲染进一个游离 `<div>`，`OutlineDrawer` 只是在对应 tab 激活时把这个 `<div>` reparent 进可见插槽——面板内部 React 状态在切 tab 时不丢失，插件停用时才真正 unmount）。

**Tech Stack:** React 18 (`react-dom/client` `createRoot`)、Zustand、Vitest + @testing-library/react（jsdom）。

## Global Constraints

- 中文命令标题/分类，和现有 `appCommands.ts` 的措辞风格一致（如 `视图`/`应用`/`窗口` 这类两三字分类名）。
- 插件只声明它实际使用、且 host 真正校验的权限（`宁缺毋滥`，5.1 已确立的原则）。
- `PluginContext`/`HostServices` 的类型签名（`plugin-api/types.ts`、`plugin-api/host.ts`）在本期不改；只新增消费方。
- 每个任务的 UI 视觉表现（tab 文案 "Schedule"、日历样式、月份导航）必须和当前 `OutlineDrawer.tsx` 的 Schedule tab 逐像素一致——这是一次架构搬迁，不是重新设计。
- 每个任务独立 commit，遵循 TDD（先写失败测试）。

---

### Task 1: `pluginUiStore` — 真实 UiSink 的存储层

**Files:**
- Create: `src/renderer/src/stores/pluginUiStore.ts`
- Test: `test/pluginUiStore.test.ts`

**Interfaces:**
- Consumes: `SidebarPanelContribution`、`StatusItemContribution`（`@/plugin-api`，5.1 已定义，字段见下）：
  ```ts
  interface SidebarPanelContribution {
    id: string
    title: string
    icon: string
    render(container: HTMLElement): () => void
  }
  interface StatusItemContribution {
    id: string
    render(): string
  }
  ```
- Produces（后续任务消费）：
  ```ts
  interface RegisteredSidebarPanel {
    descriptor: SidebarPanelContribution
    /** 已经调用过 descriptor.render() 的游离容器；未挂进真实 DOM 前一直存在于内存。 */
    container: HTMLElement
  }
  interface PluginUiState {
    sidebarPanels: RegisteredSidebarPanel[]
    statusItems: StatusItemContribution[]
    addSidebarPanel: (panel: RegisteredSidebarPanel) => void
    removeSidebarPanel: (id: string) => void
    addStatusItem: (item: StatusItemContribution) => void
    removeStatusItem: (id: string) => void
  }
  export const usePluginUiStore: UseBoundStore<StoreApi<PluginUiState>>
  ```
  Task 2（usePluginHost）用 `addSidebarPanel`/`removeSidebarPanel` 实现真实 `UiSink`；Task 5（OutlineDrawer）用 `usePluginUiStore((s) => s.sidebarPanels)` 读取动态 tab 列表。

- [ ] **Step 1: 写失败测试**

```ts
// test/pluginUiStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { usePluginUiStore } from '@/stores/pluginUiStore'

function makePanel(id: string) {
  return {
    descriptor: {
      id,
      title: id,
      icon: 'Calendar',
      render: () => () => {}
    },
    container: document.createElement('div')
  }
}

beforeEach(() => {
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

describe('pluginUiStore — sidebar panels', () => {
  it('starts empty', () => {
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([])
  })

  it('addSidebarPanel appends a panel', () => {
    const panel = makePanel('builtin.schedule')
    usePluginUiStore.getState().addSidebarPanel(panel)
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([panel])
  })

  it('removeSidebarPanel removes by id and leaves others untouched', () => {
    const a = makePanel('a')
    const b = makePanel('b')
    usePluginUiStore.getState().addSidebarPanel(a)
    usePluginUiStore.getState().addSidebarPanel(b)
    usePluginUiStore.getState().removeSidebarPanel('a')
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([b])
  })

  it('removeSidebarPanel on an unknown id is a no-op', () => {
    const a = makePanel('a')
    usePluginUiStore.getState().addSidebarPanel(a)
    usePluginUiStore.getState().removeSidebarPanel('nope')
    expect(usePluginUiStore.getState().sidebarPanels).toEqual([a])
  })
})

describe('pluginUiStore — status items', () => {
  it('addStatusItem/removeStatusItem mirror the sidebar-panel behavior', () => {
    const item = { id: 's1', render: () => 'hi' }
    usePluginUiStore.getState().addStatusItem(item)
    expect(usePluginUiStore.getState().statusItems).toEqual([item])
    usePluginUiStore.getState().removeStatusItem('s1')
    expect(usePluginUiStore.getState().statusItems).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/pluginUiStore.test.ts`
Expected: FAIL — `Cannot find module '@/stores/pluginUiStore'`

- [ ] **Step 3: 实现 store**

```ts
// src/renderer/src/stores/pluginUiStore.ts
import { create } from 'zustand'
import type { SidebarPanelContribution, StatusItemContribution } from '@/plugin-api'

/** A sidebar panel that has already been rendered into a detached container. */
export interface RegisteredSidebarPanel {
  descriptor: SidebarPanelContribution
  container: HTMLElement
}

interface PluginUiState {
  sidebarPanels: RegisteredSidebarPanel[]
  statusItems: StatusItemContribution[]
  addSidebarPanel: (panel: RegisteredSidebarPanel) => void
  removeSidebarPanel: (id: string) => void
  addStatusItem: (item: StatusItemContribution) => void
  removeStatusItem: (id: string) => void
}

/**
 * Backing store for the app's real `UiSink` (plugin-api/host.ts). Registration
 * renders eagerly into a detached container (see usePluginHost); consumers
 * (OutlineDrawer) only reparent that container into visible DOM when its tab
 * is active — the container itself, and any React state inside it, survives
 * tab switches and is only torn down when the panel is removed here.
 */
export const usePluginUiStore = create<PluginUiState>((set) => ({
  sidebarPanels: [],
  statusItems: [],
  addSidebarPanel: (panel) => set((s) => ({ sidebarPanels: [...s.sidebarPanels, panel] })),
  removeSidebarPanel: (id) =>
    set((s) => ({ sidebarPanels: s.sidebarPanels.filter((p) => p.descriptor.id !== id) })),
  addStatusItem: (item) => set((s) => ({ statusItems: [...s.statusItems, item] })),
  removeStatusItem: (id) =>
    set((s) => ({ statusItems: s.statusItems.filter((i) => i.id !== id) }))
}))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/pluginUiStore.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/pluginUiStore.ts test/pluginUiStore.test.ts
git commit -m "feat(plugin-api): pluginUiStore 承接真实 UiSink 的 panel/status 注册"
```

---

### Task 2: `ScheduleCalendarPanel` — 从 OutlineDrawer 抽出日历组件

**Files:**
- Create: `src/renderer/src/plugin-api/builtins/ScheduleCalendarPanel.tsx`
- Test: `test/scheduleCalendarPanel-dom.test.tsx`

**Interfaces:**
- Consumes: `useDocumentStore((s) => s.content)`、`useVaultStore((s) => s.tree)`、`useSettingsStore((s) => s.scheduleDir)`（均为已存在的 store，字段签名不变）；`collectScheduleDates(tree, dir)`、`formatDateKey(d)`（`@/core/schedule`，已存在，见 `src/renderer/src/core/schedule/index.ts`）。
- Produces（Task 3 消费）：
  ```ts
  export interface ScheduleCalendarPanelProps {
    onOpenSchedule?: (date: Date) => void
  }
  export function ScheduleCalendarPanel(props: ScheduleCalendarPanelProps): JSX.Element
  ```

这一步是纯搬迁：把 `OutlineDrawer.tsx` 里 Schedule 分支的全部逻辑（`parseScheduleDate`/`parseCurrentScheduleDate`/`monthGrid`/`WEEKDAYS`/状态/JSX）原样挪到新组件，唯一的行为变化是数据来源从 props 改成直接订阅 store（`tree`/`scheduleDir` 不再是 props）。`onOpenSchedule` 保留为 prop（由插件在 `activate` 时注入 `openScheduleNote`）。

- [ ] **Step 1: 写失败测试**（对应旧 `test/outlineDrawer-dom.test.tsx` 里 Schedule tab 的两个用例，改为直接渲染新组件、用 store 取代 props 传入 tree/scheduleDir）

```tsx
// test/scheduleCalendarPanel-dom.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScheduleCalendarPanel } from '@/plugin-api/builtins/ScheduleCalendarPanel'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: '日程',
    path: '/v/日程',
    type: 'folder',
    children: [
      { name: '2026-06-28.md', path: '/v/日程/2026-06-28.md', type: 'file' },
      { name: '2026-06-30.md', path: '/v/日程/2026-06-30.md', type: 'file' }
    ]
  }
]

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
  useVaultStore.getState().setTree([])
  useSettingsStore.setState({ scheduleDir: '日程' })
})

function seed(content: string): void {
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/日程/2026-06-28.md', content)
  useVaultStore.getState().setTree(tree)
  useSettingsStore.setState({ scheduleDir: '日程' })
}

describe('ScheduleCalendarPanel', () => {
  it('renders a month calendar and marks dates that have schedule notes', () => {
    seed(`---
type: 日程
date: 2026-06-28
---

# 2026-06-28 日程

## 今日待办
- [ ] Review launch plan

## 记录
Met with product team.
`)
    const onOpenSchedule = vi.fn()
    render(<ScheduleCalendarPanel onOpenSchedule={onOpenSchedule} />)

    expect(screen.getByText('2026 年 6 月')).toBeTruthy()
    const dayWithNote = screen.getByRole('button', { name: '2026-06-30' })
    expect(dayWithNote.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByText('Review launch plan')).toBeNull()
    expect(screen.queryByText('Met with product team.')).toBeNull()

    fireEvent.click(dayWithNote)
    expect(onOpenSchedule).toHaveBeenCalledOnce()
    expect(onOpenSchedule.mock.calls[0][0]).toEqual(new Date(2026, 5, 30))
  })

  it('can navigate to another month', () => {
    seed(`---
type: 日程
date: 2026-06-28
---
`)
    render(<ScheduleCalendarPanel />)

    fireEvent.click(screen.getByRole('button', { name: '下个月' }))

    expect(screen.getByText('2026 年 7 月')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/scheduleCalendarPanel-dom.test.tsx`
Expected: FAIL — `Cannot find module '@/plugin-api/builtins/ScheduleCalendarPanel'`

- [ ] **Step 3: 实现组件**（逻辑原样照抄 `OutlineDrawer.tsx` 当前的 Schedule 分支，见该文件第 8-40、61-67、183-220 行；下方是完整搬迁后的文件）

```tsx
// src/renderer/src/plugin-api/builtins/ScheduleCalendarPanel.tsx
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { collectScheduleDates, formatDateKey } from '@/core/schedule'

function parseScheduleDate(value: string | null): Date | null {
  if (!value) return null
  const normalized = value.trim().replace(/\//g, '-')
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function parseCurrentScheduleDate(content: string): Date | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === '---') break
      const date = trimmed.match(/^date:\s*(.+)$/i)
      if (date) return parseScheduleDate(date[1])
    }
  }
  const title = content.match(/^#\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/m)
  return title ? parseScheduleDate(title[1]) : null
}

function monthGrid(view: Date): Date[] {
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return cells
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface ScheduleCalendarPanelProps {
  onOpenSchedule?: (date: Date) => void
}

/**
 * The Schedule tab's calendar UI (moved out of OutlineDrawer for P5.2 — this
 * is now the `render()` target of the built-in schedule plugin's sidebar
 * panel). Reads tree/scheduleDir/content from stores directly instead of via
 * props, since it's mounted standalone by the plugin host, not by a parent
 * that owns that data.
 */
export function ScheduleCalendarPanel({
  onOpenSchedule
}: ScheduleCalendarPanelProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const tree = useVaultStore((s) => s.tree)
  const scheduleDir = useSettingsStore((s) => s.scheduleDir)
  const activeScheduleDate = useMemo(() => parseCurrentScheduleDate(content), [content])
  const [calendarView, setCalendarView] = useState(() => {
    const anchor = activeScheduleDate ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const scheduleDates = useMemo(() => collectScheduleDates(tree, scheduleDir), [tree, scheduleDir])
  const calendarCells = useMemo(() => monthGrid(calendarView), [calendarView])

  useEffect(() => {
    if (!activeScheduleDate) return
    setCalendarView(new Date(activeScheduleDate.getFullYear(), activeScheduleDate.getMonth(), 1))
  }, [activeScheduleDate])

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          aria-label="上个月"
          className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="text-[13px] font-bold text-foreground">
          {calendarView.getFullYear()} 年 {calendarView.getMonth() + 1} 月
        </div>
        <button
          type="button"
          onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          aria-label="下个月"
          className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 px-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="pb-1 font-[family-name:var(--mono)] text-[10px] font-medium text-[color:var(--text-faint)]">
            {weekday}
          </div>
        ))}
        {calendarCells.map((date) => {
          const key = formatDateKey(date)
          const inMonth = date.getMonth() === calendarView.getMonth()
          const selected = activeScheduleDate ? key === formatDateKey(activeScheduleDate) : false
          const today = key === formatDateKey(new Date())
          const hasNote = scheduleDates.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenSchedule?.(date)}
              title={hasNote ? `${key} · 已有日程` : key}
              aria-label={key}
              className="group mx-auto flex h-[40px] w-[34px] flex-col items-center justify-start rounded-lg pt-[3px] transition-colors hover:bg-[color:var(--bg-hover)]"
            >
              <span
                className={[
                  'grid h-[30px] w-[30px] place-items-center rounded-lg text-[13px] transition-colors',
                  selected
                    ? 'bg-[color:var(--accent)] font-bold text-[color:var(--accent-ink)]'
                    : inMonth
                      ? 'bg-[color:var(--bg-panel)] font-medium text-[color:var(--text-dim)]'
                      : 'bg-transparent font-medium text-[color:var(--text-faint)]',
                  !selected && today ? 'shadow-[inset_0_0_0_1px_var(--accent-line)]' : ''
                ].join(' ')}
              >
                {date.getDate()}
              </span>
              {hasNote && (
                <span aria-hidden className="mt-[2px] h-1 w-1 rounded-full bg-[color:var(--red)]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/scheduleCalendarPanel-dom.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/plugin-api/builtins/ScheduleCalendarPanel.tsx test/scheduleCalendarPanel-dom.test.tsx
git commit -m "refactor(plugin-api): 从 OutlineDrawer 抽出 ScheduleCalendarPanel，改订阅 store"
```

---

### Task 3: `schedulePlugin` — 包成 `MarginPlugin`

**Files:**
- Create: `src/renderer/src/plugin-api/builtins/schedulePlugin.ts`
- Modify: `src/renderer/src/plugin-api/index.ts`（追加导出）
- Test: `test/schedulePlugin.test.ts`

**Interfaces:**
- Consumes: `ScheduleCalendarPanel`（Task 2）；`MarginPlugin`/`PluginContext`（`@/plugin-api`，已有）；`createRoot`（`react-dom/client`，已在 `main.tsx`/`demo.tsx` 用过的既有模式）。
- Produces（Task 4 消费）：
  ```ts
  export function createSchedulePlugin(onOpenToday: (date: Date) => void): MarginPlugin
  ```
  `manifest.id === 'builtin.schedule'`，`permissions === ['commands', 'ui.sidebar']`；`activate` 注册命令 `schedule.openToday`（`run()` 调用 `onOpenToday(new Date())`）和一个 `id: 'builtin.schedule'` 的 sidebar panel（`render` 用 `createRoot` 挂载 `<ScheduleCalendarPanel onOpenSchedule={onOpenToday} />`，返回 `() => root.unmount()`）。

- [ ] **Step 1: 写失败测试**

```ts
// test/schedulePlugin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PluginHost, EventBus, type HostServices, type CommandContribution, type SidebarPanelContribution } from '@/plugin-api'
import { createSchedulePlugin } from '@/plugin-api/builtins/schedulePlugin'

function makeServices(): HostServices & {
  registered: Map<string, CommandContribution>
  panels: Map<string, SidebarPanelContribution>
} {
  const registered = new Map<string, CommandContribution>()
  const panels = new Map<string, SidebarPanelContribution>()
  return {
    registered,
    panels,
    commands: {
      register: (c) => {
        registered.set(c.id, c)
        return { dispose: () => registered.delete(c.id) }
      }
    },
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('schedulePlugin', () => {
  it('declares commands + ui.sidebar permissions only', () => {
    const plugin = createSchedulePlugin(vi.fn())
    expect(plugin.manifest.id).toBe('builtin.schedule')
    expect(plugin.manifest.permissions).toEqual(['commands', 'ui.sidebar'])
  })

  it('registers schedule.openToday, which calls onOpenToday with today', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    const onOpenToday = vi.fn()
    await host.activate(createSchedulePlugin(onOpenToday))

    expect(services.registered.has('schedule.openToday')).toBe(true)
    await services.registered.get('schedule.openToday')!.run()
    expect(onOpenToday).toHaveBeenCalledWith(new Date(2026, 5, 15, 10, 0, 0))
  })

  it('registers a sidebar panel with id builtin.schedule', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createSchedulePlugin(vi.fn()))
    expect(services.panels.has('builtin.schedule')).toBe(true)
    expect(services.panels.get('builtin.schedule')!.title).toBe('Schedule')
  })

  it('deactivation disposes the command and the panel', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createSchedulePlugin(vi.fn()))
    await host.deactivate('builtin.schedule')
    expect(services.registered.size).toBe(0)
    expect(services.panels.size).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/schedulePlugin.test.ts`
Expected: FAIL — `Cannot find module '@/plugin-api/builtins/schedulePlugin'`

- [ ] **Step 3: 实现插件**

```ts
// src/renderer/src/plugin-api/builtins/schedulePlugin.ts
import { createRoot } from 'react-dom/client'
import type { MarginPlugin } from '../types'
import { ScheduleCalendarPanel } from './ScheduleCalendarPanel'

/**
 * Built-in schedule plugin (P5.2): registers `schedule.openToday` and a
 * sidebar panel rendering the calendar. `onOpenToday` is injected by the host
 * app (App.tsx passes `fileOps.openScheduleNote`) — the plugin itself has no
 * vault-write capability, matching the existing `createVaultInfoPlugin`
 * pattern of taking host callbacks rather than reaching for app internals.
 */
export function createSchedulePlugin(onOpenToday: (date: Date) => void): MarginPlugin {
  return {
    manifest: {
      id: 'builtin.schedule',
      name: '日程',
      version: '0.1.0',
      permissions: ['commands', 'ui.sidebar']
    },
    activate(ctx) {
      ctx.commands.register({
        id: 'schedule.openToday',
        title: '打开今日日程',
        category: '日程',
        run: () => onOpenToday(new Date())
      })
      ctx.ui.registerSidebarPanel({
        id: 'builtin.schedule',
        title: 'Schedule',
        icon: 'Calendar',
        render: (container) => {
          const root = createRoot(container)
          root.render(<ScheduleCalendarPanel onOpenSchedule={onOpenToday} />)
          return () => root.unmount()
        }
      })
    }
  }
}
```

`schedulePlugin.ts` 用了 JSX，需改后缀为 `.tsx`：

- Create（更正）: `src/renderer/src/plugin-api/builtins/schedulePlugin.tsx`（不是 `.ts`——上面 Step 1 测试里的 import 路径 `@/plugin-api/builtins/schedulePlugin` 不受影响，两者都由 `@` 别名解析扩展名）

追加到 barrel：

```ts
// src/renderer/src/plugin-api/index.ts — 在现有 `export { createVaultInfoPlugin } ...` 后追加一行
export { createSchedulePlugin } from './builtins/schedulePlugin'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/schedulePlugin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/plugin-api/builtins/schedulePlugin.tsx src/renderer/src/plugin-api/index.ts test/schedulePlugin.test.ts
git commit -m "feat(plugin-api): 新增 schedulePlugin，注册 schedule.openToday + sidebar panel"
```

---

### Task 4: `usePluginHost` — 在 App 里实例化 PluginHost，接真实 UiSink

**Files:**
- Create: `src/renderer/src/hooks/usePluginHost.ts`
- Test: `test/usePluginHost.test.tsx`

**Interfaces:**
- Consumes: `PluginHost`/`EventBus`/`CommandRegistry`（`@/plugin-api`、`@/core/commands/registry`，均已有）；`createSchedulePlugin`（Task 3）；`usePluginUiStore`（Task 1）；`useVaultStore`、`useSettingsStore((s) => s.scheduleEnabled)`（已有，字段签名同 App.tsx 现状：`root: string | null`、`tree: TreeNode[]`、`scheduleEnabled: boolean`）。
- Produces（Task 6 消费）：
  ```ts
  export function usePluginHost(onOpenToday: (date: Date) => void): void
  ```
  纯副作用 hook，无返回值——按 `scheduleEnabled` 切换 schedule 插件的激活状态，并把面板注册进 `pluginUiStore`。

- [ ] **Step 1: 写失败测试**

```tsx
// test/usePluginHost.test.tsx
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
  it('activates the schedule plugin (registers its sidebar panel) when scheduleEnabled is true', async () => {
    const onOpenToday = vi.fn()
    renderHook(() => usePluginHost(onOpenToday))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.some((p) => p.descriptor.id === 'builtin.schedule')).toBe(true)
  })

  it('deactivates the schedule plugin (panel disappears) when scheduleEnabled flips to false', async () => {
    const onOpenToday = vi.fn()
    renderHook(() => usePluginHost(onOpenToday))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)

    await act(async () => {
      useSettingsStore.getState().setScheduleEnabled(false)
    })

    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })

  it('does not activate when scheduleEnabled starts false', async () => {
    useSettingsStore.setState({ scheduleEnabled: false })
    renderHook(() => usePluginHost(vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })

  it('unmounting the hook deactivates the plugin (no leaked panel)', async () => {
    const { unmount } = renderHook(() => usePluginHost(vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(1)
    unmount()
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/usePluginHost.test.tsx`
Expected: FAIL — `Cannot find module '@/hooks/usePluginHost'`

- [ ] **Step 3: 实现 hook**

```ts
// src/renderer/src/hooks/usePluginHost.ts
import { useEffect, useRef } from 'react'
import { PluginHost, EventBus, createSchedulePlugin, type HostServices } from '@/plugin-api'
import { CommandRegistry } from '@/core/commands/registry'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

/**
 * Instantiates the app's `PluginHost` (plugin-api/host.ts) with real
 * `HostServices` and activates/deactivates the built-in schedule plugin as
 * `scheduleEnabled` toggles (P5.2 — the first real consumer of PluginHost;
 * previously it only existed inside plugin-api's own tests).
 *
 * `commands` uses its own `CommandRegistry` instance, mirroring the pattern
 * already used by `useGlobalKeymap` — binding these commands into the global
 * keymap/slash menu is a future task (`可绑快捷键/slash`, plan §5.2), not this
 * one; this hook only makes the registry real and inspectable.
 *
 * `ui.registerSidebarPanel` renders eagerly into a detached `<div>` (via the
 * panel's own `render()`) and stores it in `pluginUiStore` — OutlineDrawer
 * reparents that same container into visible DOM when its tab is active, so
 * the panel's React state survives tab switches and is only torn down when
 * this hook deactivates the plugin.
 */
export function usePluginHost(onOpenToday: (date: Date) => void): void {
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
  const onOpenTodayRef = useRef(onOpenToday)
  onOpenTodayRef.current = onOpenToday

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
              unmount()
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
    if (!scheduleEnabled) return
    void host.activate(createSchedulePlugin((date) => onOpenTodayRef.current(date)))
    return () => {
      void host.deactivate('builtin.schedule')
    }
  }, [scheduleEnabled])
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/usePluginHost.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/usePluginHost.ts test/usePluginHost.test.tsx
git commit -m "feat(plugin-api): usePluginHost 接真实 UiSink，按 scheduleEnabled 激活 schedule 插件"
```

---

### Task 5: `OutlineDrawer` — Schedule tab 改为渲染已注册的插件面板

**Files:**
- Modify: `src/renderer/src/components/OutlineDrawer.tsx`
- Modify: `test/outlineDrawer-dom.test.tsx`（重写，原两条 Schedule tab 用例已在 Task 2 移到 `scheduleCalendarPanel-dom.test.tsx`，这里改为测试"动态 tab 挂载/卸载插件面板"这个通用机制）

**Interfaces:**
- Consumes: `usePluginUiStore((s) => s.sidebarPanels)`（Task 1，返回 `RegisteredSidebarPanel[]`）。
- Produces: `OutlineDrawerProps` 收窄——去掉 `tree`、`scheduleDir`、`onOpenSchedule`（不再被这个组件使用；Task 6 会同步清理 App.tsx 调用处）。

- [ ] **Step 1: 写失败测试**

```tsx
// test/outlineDrawer-dom.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { useDocumentStore } from '@/stores/documentStore'
import { usePluginUiStore } from '@/stores/pluginUiStore'

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
})

function registerFakePanel(id: string, title: string, marker: string): void {
  const container = document.createElement('div')
  container.textContent = marker
  usePluginUiStore.getState().addSidebarPanel({
    descriptor: { id, title, icon: 'Calendar', render: () => () => {} },
    container
  })
}

describe('OutlineDrawer — outline tab (always present)', () => {
  it('shows the outline heading list by default', () => {
    useDocumentStore.getState().openOrActivate('/v/a.md', '# Title\n\ntext')
    render(<OutlineDrawer width={280} />)
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()
  })
})

describe('OutlineDrawer — dynamic plugin panel tabs', () => {
  it('renders a tab per registered sidebar panel and mounts its container when selected', () => {
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()
    fireEvent.click(tab)

    expect(screen.getByText('schedule-marker')).toBeTruthy()
  })

  it('falls back to the outline tab when the active panel is unregistered', () => {
    registerFakePanel('builtin.schedule', 'Schedule', 'schedule-marker')
    render(<OutlineDrawer width={280} />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('schedule-marker')).toBeTruthy()

    usePluginUiStore.getState().removeSidebarPanel('builtin.schedule')

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull()
    expect(screen.getByText('Table of Contents')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/outlineDrawer-dom.test.tsx`
Expected: FAIL — no `Schedule` tab rendered (old component doesn't read `pluginUiStore`); `OutlineDrawer` 仍要求 `tree`/`scheduleDir` 等旧 props 类型也会在这一步的重写中被移除，编译期即会报错，属预期失败的一部分。

- [ ] **Step 3: 重写 OutlineDrawer.tsx**

```tsx
// src/renderer/src/components/OutlineDrawer.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePluginUiStore, type RegisteredSidebarPanel } from '@/stores/pluginUiStore'
import { collectOutline, type OutlineItem } from '@/editor-core'

interface OutlineDrawerProps {
  width: number
  onJumpToLine?: (line: number) => void
}

/** Reparents an already-rendered plugin panel container into visible DOM while active; detaching (not unmounting) it when the tab switches away, so the panel's React state survives. */
function PanelSlot({ container }: { container: HTMLElement }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.appendChild(container)
  }, [container])
  return <div ref={ref} className="flex min-h-0 flex-1 flex-col" />
}

export function OutlineDrawer({ width, onJumpToLine }: OutlineDrawerProps): JSX.Element {
  const content = useDocumentStore((s) => s.content)
  const headings = useMemo(() => collectOutline(content), [content])
  const panels = usePluginUiStore((s) => s.sidebarPanels)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tab, setTab] = useState<string>('outline')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (tab === 'outline') return
    if (!panels.some((p) => p.descriptor.id === tab)) setTab('outline')
  }, [panels, tab])

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

  const activePanel: RegisteredSidebarPanel | undefined = panels.find(
    (p) => p.descriptor.id === tab
  )

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-l border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] px-3.5 py-3.5 shadow-[var(--drawer-shadow)]"
    >
      <div className="mb-[18px] flex shrink-0 rounded-lg bg-[color:var(--bg-hover)] p-[3px]">
        <button
          onClick={() => setTab('outline')}
          className={[
            'flex-1 rounded-md py-[7px] text-[12.5px] transition-colors',
            tab === 'outline'
              ? 'bg-[color:var(--bg-elev)] font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)]'
              : 'font-medium text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]'
          ].join(' ')}
        >
          Outline
        </button>
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
      {tab === 'outline' ? (
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
      ) : activePanel ? (
        <PanelSlot key={activePanel.descriptor.id} container={activePanel.container} />
      ) : null}
    </aside>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/outlineDrawer-dom.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OutlineDrawer.tsx test/outlineDrawer-dom.test.tsx
git commit -m "refactor(editor): OutlineDrawer 的 Schedule tab 改由插件面板动态渲染"
```

---

### Task 6: App.tsx 接线 + 全量回归

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `usePluginHost`（Task 4）；简化后的 `OutlineDrawer` props（Task 5：只剩 `width`、`onJumpToLine`）。

- [ ] **Step 1: 接入 usePluginHost，精简 OutlineDrawer 调用**

在 `src/renderer/src/App.tsx` 里：

1. 新增 import：
```ts
import { usePluginHost } from '@/hooks/usePluginHost'
```

2. 在 `useGlobalKeymap()` 调用之后（第 98 行附近）新增：
```ts
  /* ── Plugin host (built-in schedule plugin) ────────────────── */

  usePluginHost(fileOps.openScheduleNote)
```

3. 把第 277-283 行的 `<OutlineDrawer .../>` 调用从：
```tsx
              <OutlineDrawer
                width={rightPaneWidth}
                tree={vaultTree}
                scheduleDir={scheduleDir}
                onJumpToLine={handleJumpToLine}
                onOpenSchedule={(date) => void fileOps.openScheduleNote(date)}
              />
```
改为：
```tsx
              <OutlineDrawer width={rightPaneWidth} onJumpToLine={handleJumpToLine} />
```

4. `vaultTree`/`scheduleDir` 两个局部变量此后若再无其他消费者会成为死代码——检查 `scheduleEnabled`/`scheduleDir`/`vaultTree` 在 App.tsx 里的其余用途（`vaultTree` 还喂给 `Sidebar`/`SearchOverlay`/`MoveDialog`，`scheduleDir` 目前只被 OutlineDrawer 用，去掉后若无其他引用需一并删除该行 `const scheduleDir = useSettingsStore((s) => s.scheduleDir)`）。

- [ ] **Step 2: 编译检查**

Run: `pnpm typecheck` (或仓库里对应的 `tsc --noEmit` 脚本，与 3.5/4.x 收尾时用的命令一致)
Expected: 无类型错误；若 `scheduleDir` 变量因未使用报错，按上一步删除该行。

- [ ] **Step 3: 全量测试回归**

Run: `pnpm vitest run`
Expected: 全绿，重点关注 `test/app-rerender.test.tsx`（App 顶层渲染次数基线不应回退）与本期新增的 5 个测试文件（`pluginUiStore`、`scheduleCalendarPanel-dom`、`schedulePlugin`、`usePluginHost`、`outlineDrawer-dom`）。

- [ ] **Step 4: 手动验收**（Tauri/demo 环境，比照 `plan §5.2` 验收标准）

Run: `pnpm demo`（或仓库现有的手感验收命令，与 P1.6/P4 收尾一致）
清单：
- 打开一个 vault，⌘\ 打开 Outline 抽屉，能看到 "Outline" 和 "Schedule" 两个 tab，行为和搬迁前逐像素一致（月份导航、点击日期打开笔记、标红点）。
- 设置面板里关掉"日程"开关（`scheduleEnabled=false`）后，Schedule tab 从抽屉里消失，且没有报错（对应 plan 验收标准"关闭插件后日程入口消失且无报错"）；重新打开开关后 tab 恢复。
- 切换 Outline ↔ Schedule 后再切回来，日历停留的月份不应重置（PanelSlot 的 reparent-not-remount 设计的可观察效果）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(app): 接入 usePluginHost，OutlineDrawer 调用处随 Schedule tab 迁移精简"
```

---

## 风险与回退

| 风险 | 缓解 |
|------|------|
| `PanelSlot` 的 reparent-not-remount 设计比"每次都重新 render"更容易有 DOM 生命周期 bug（比如 container 从未被添加到 document 就被认为"已挂载"） | Task 5 的 dom 测试直接断言 container 内容出现在 `screen` 查询范围内，等价于验证了真实挂载路径；Task 4 的 unmount 测试验证 dispose 路径不泄漏 |
| `usePluginHost` 里 `hostRef`/`services` 用 `useRef` 懒初始化，容易在 StrictMode 双调用下出问题 | 测试用 `renderHook`（默认走 StrictMode-off 的 react-dom test-utils 路径）验证；若上线后 StrictMode 下发现双激活，需要额外加 `PluginHost.isActive` 前置检查（当前 `activate` 已对重复 id 抛错，不会静默双注册，问题会在测试阶段就暴露） |
| `schedulePlugin.tsx` 用 JSX 但文件名之前设想是 `.ts` | Step 3 已在 Task 3 明确写出用 `.tsx` 后缀，`@` 别名解析对两者一视同仁，不影响 import 语句 |

## 自审记录（writing-plans Self-Review）

- **spec 覆盖**：`plan §5.2` 的三条硬性要求——① `plugin-api/builtins/schedulePlugin.ts`（Task 3，含 `.tsx` 更正）② `OutlineDrawer.tsx` Schedule tab 改插件面板渲染（Task 5）③ 验收"关闭插件后入口消失无报错"+`test/pluginHost.test.ts` 覆盖激活/停用/dispose（Task 3 的 `schedulePlugin.test.ts` 覆盖激活/命令/面板/停用四个点；Task 4 的 `usePluginHost.test.tsx` 覆盖"scheduleEnabled=false 时不激活/切换时增删面板/卸载时不泄漏"，合起来对应验收标准）。`SettingsPanel.tsx` 按 spec"不变，仍管配置"——未改动，符合。✓
- **占位符检查**：全文无 TBD/待补，每个 Step 都是可执行的完整代码。✓
- **类型一致性**：`RegisteredSidebarPanel`（Task 1 定义 → Task 4 `addSidebarPanel` 消费 → Task 5 `PanelSlot` 消费，字段 `descriptor`/`container` 三处一致）；`ScheduleCalendarPanelProps`（Task 2 定义 `onOpenSchedule?`→ Task 3 `render` 内消费一致）；`createSchedulePlugin(onOpenToday)`（Task 3 定义 → Task 4 `usePluginHost` 消费 → Task 6 `App.tsx` 传入 `fileOps.openScheduleNote` 一致，签名均为 `(date: Date) => void`/`Promise<void>`，JS 对 `void` 返回值兼容 async 函数）；`usePluginHost(onOpenToday)`（Task 4 定义 → Task 6 消费签名一致）；`OutlineDrawerProps`（Task 5 收窄为 `{width, onJumpToLine}` → Task 6 调用处同步精简，无遗留旧 prop）。✓
