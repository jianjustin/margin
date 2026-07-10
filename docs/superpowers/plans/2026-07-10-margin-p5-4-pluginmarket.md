# P5.4 PluginMarket 真实化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `PluginMarket.tsx` 展示真实的内置插件目录（而不是硬编码的假数据），并能真正开关每个内置插件（outline、schedule），状态统一持久化在 `settingsStore` 的新字段 `enabledPlugins: string[]` 里。

**Architecture:** 引入 `enabledPlugins: string[]`（默认 `['builtin.outline', 'builtin.schedule']`）取代原来 schedule 专属的 `scheduleEnabled: boolean`，作为"哪些内置插件当前启用"的唯一数据源；`usePluginHost` 的两个激活 effect 都从这个数组派生自己的布尔开关（各自独立判断成员资格，避免任一插件切换时另一个也跟着重新挂载）。新增一个纯静态的 `BUILTIN_PLUGIN_MANIFESTS` 目录（通过用空回调调用两个插件工厂、只读取其 `.manifest` 来获取，无副作用），供 `PluginMarket` 展示"当前未启用"的插件——这是 `PluginHost.list()`（只返回已激活插件）做不到的事，所以并列存在，职责不同。`PluginMarket` 的开关直接写 `settingsStore`，`usePluginHost` 的 effect 被动响应，不需要 `PluginMarket` 直接持有 `PluginHost` 实例。

**Tech Stack:** React 18 + Zustand + TypeScript + Vitest + Testing Library（与现有代码库一致，不引入新依赖）。

## Global Constraints

- `plugin-api/types.ts`、`plugin-api/host.ts` 本期不改——延续 P5.1-5.3 的既定约束，`PluginHost.list()` 语义（只返回已激活插件）不变。
- UI 视觉表现：`AppHeader`/`Sidebar` 的"今日日程"按钮可见性逻辑不变（仍是一个布尔值，只是这个布尔值现在从 `enabledPlugins` 数组派生，不再是独立字段）——不重新设计这两个组件。
- 已有的 vault 级 `.margin/config.json` 持久化、跨窗口 `EV_SETTINGS_CHANGED` 同步机制必须对新字段同样生效，且要有从旧版 `scheduleEnabled: boolean` 迁移到 `enabledPlugins: string[]` 的一次性兼容逻辑（不能让已有用户升级后日程设置被静默重置）。
- 每个任务独立 commit，遵循 TDD（先写失败测试）。
- 第三方插件安装不在本期——`PluginMarket` 只管理内置插件（outline、schedule）的展示与开关。

---

## Task 1: settingsStore — enabledPlugins 迁移

**Files:**
- Modify: `src/renderer/src/stores/settingsStore.ts`
- Modify: `test/projectConfig.test.ts`
- Modify: `test/useProjectConfig.test.tsx`

**Interfaces:**
- Produces: `Settings.enabledPlugins: string[]`；`useSettingsStore` 新增 action `setPluginEnabled(id: string, enabled: boolean): void`（替代删除的 `setScheduleEnabled`）；新增导出的纯函数 `migrateLegacyScheduleEnabled(parsed: Record<string, unknown>): Partial<Settings>`。
- Consumes: 无（这是本期最底层的任务）。

- [ ] **Step 1: 写失败测试（projectConfig.test.ts 的 enabledPlugins 化 + 迁移函数）**

把 `test/projectConfig.test.ts` 整个替换为：

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  projectConfigOf,
  sanitizeProjectConfig,
  migrateLegacyScheduleEnabled
} from '@/stores/settingsStore'
import { normalizeHiddenFolderRules } from '@/lib/folderRules'

describe('project config helpers', () => {
  describe('hidden folder rules', () => {
    it('normalizes names and relative paths', () => {
      expect(normalizeHiddenFolderRules([' .claude ', '/Projects/archive/', 'A\\B', '', '.claude'])).toEqual([
        '.claude',
        'Projects/archive',
        'A/B'
      ])
    })

    it('drops built-in hidden folders from user rules', () => {
      expect(normalizeHiddenFolderRules(['.margin', '.obsidian', '.git', '.trash', '.claude'])).toEqual([
        '.claude'
      ])
    })
  })

  describe('sanitizeProjectConfig', () => {
    it('keeps valid fields', () => {
      expect(sanitizeProjectConfig({
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'Daily',
        hiddenFolders: [' .claude ', 'Projects/archive']
      })).toEqual({
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'Daily',
        hiddenFolders: ['.claude', 'Projects/archive']
      })
    })

    it('trims scheduleDir and drops blank values', () => {
      expect(sanitizeProjectConfig({ scheduleDir: '  Notes  ' })).toEqual({ scheduleDir: 'Notes' })
      expect(sanitizeProjectConfig({ scheduleDir: '   ' })).toEqual({})
    })

    it('ignores wrong types and junk', () => {
      expect(sanitizeProjectConfig({ enabledPlugins: 'yes', scheduleDir: 5 })).toEqual({})
      expect(sanitizeProjectConfig({ enabledPlugins: ['ok', 5] })).toEqual({})
      expect(sanitizeProjectConfig(null)).toEqual({})
      expect(sanitizeProjectConfig('nope')).toEqual({})
      expect(sanitizeProjectConfig({ foo: 'bar' })).toEqual({})
    })
  })

  describe('projectConfigOf', () => {
    it('extracts only the project-persisted settings', () => {
      expect(projectConfigOf({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })).toEqual({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
        scheduleDir: '日程',
        hiddenFolders: ['.claude'],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })
    })
  })

  describe('migrateLegacyScheduleEnabled', () => {
    it('excludes builtin.schedule when the legacy field was false', () => {
      expect(migrateLegacyScheduleEnabled({ scheduleEnabled: false })).toEqual({
        enabledPlugins: ['builtin.outline']
      })
    })

    it('returns empty when the legacy field was true (defaults already include schedule)', () => {
      expect(migrateLegacyScheduleEnabled({ scheduleEnabled: true })).toEqual({})
    })

    it('returns empty when enabledPlugins is already present (new format, no migration needed)', () => {
      expect(migrateLegacyScheduleEnabled({
        scheduleEnabled: false,
        enabledPlugins: ['builtin.outline', 'builtin.schedule']
      })).toEqual({})
    })

    it('returns empty when there is no legacy field at all (fresh install)', () => {
      expect(migrateLegacyScheduleEnabled({})).toEqual({})
    })
  })

  describe('applyProjectConfig', () => {
    beforeEach(() => {
      useSettingsStore.setState({
        enabledPlugins: ['builtin.outline', 'builtin.schedule'],
        scheduleDir: '日程',
        hiddenFolders: [],
        assetsDir: 'assets',
        plantUmlServerUrl: 'https://kroki.io',
        diagramFitWidth: true,
        mathEnabled: true
      })
    })

    it('overrides in-memory settings without persisting to localStorage', () => {
      const before = localStorage.getItem('margin.settings')
      useSettingsStore.getState().applyProjectConfig({
        enabledPlugins: ['builtin.outline'],
        scheduleDir: 'X',
        hiddenFolders: ['.claude']
      })
      const s = useSettingsStore.getState()
      expect(s.enabledPlugins).toEqual(['builtin.outline'])
      expect(s.scheduleDir).toBe('X')
      expect(s.hiddenFolders).toEqual(['.claude'])
      expect(localStorage.getItem('margin.settings')).toBe(before)
    })

    it('applies a partial without clobbering untouched fields', () => {
      useSettingsStore.getState().applyProjectConfig({ scheduleDir: 'Only' })
      const s = useSettingsStore.getState()
      expect(s.scheduleDir).toBe('Only')
      expect(s.enabledPlugins).toEqual(['builtin.outline', 'builtin.schedule'])
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/projectConfig.test.ts`
Expected: FAIL — `migrateLegacyScheduleEnabled` 不存在、`sanitizeProjectConfig`/`projectConfigOf` 仍按旧的 `scheduleEnabled` 字段行事。

- [ ] **Step 3: 重写 settingsStore.ts**

把 `src/renderer/src/stores/settingsStore.ts` 整个替换为：

```ts
import { create } from 'zustand'
import { emit } from '@tauri-apps/api/event'
import { normalizeFolderPathInput, normalizeHiddenFolderRules } from '@/lib/folderRules'
import { windowId, EV_SETTINGS_CHANGED } from '@/lib/windowIdentity'

const SETTINGS_KEY = 'margin.settings'

export interface Settings {
  /** Ids of built-in plugins currently enabled (e.g. `builtin.outline`, `builtin.schedule`). */
  enabledPlugins: string[]
  /** Vault-relative folder name where daily schedule notes live. */
  scheduleDir: string
  /** Folder names or vault-relative folder paths hidden from the file library. */
  hiddenFolders: string[]
  /** Vault-relative folder where pasted or dropped image assets are copied. */
  assetsDir: string
  /** Kroki-compatible endpoint used for PlantUML and DOT diagram rendering. */
  plantUmlServerUrl: string
  /** Fit rendered diagrams to the editor width instead of showing full-size scroll. */
  diagramFitWidth: boolean
  /** Render `$...$` and `$$...$$` formulas with KaTeX. */
  mathEnabled: boolean
}

/** The settings persisted per-project in `<vault>/.margin/config.json`. */
export function projectConfigOf(s: Settings): Settings {
  return {
    enabledPlugins: [...s.enabledPlugins],
    scheduleDir: s.scheduleDir,
    hiddenFolders: normalizeHiddenFolderRules(s.hiddenFolders),
    assetsDir: normalizeConfigPath(s.assetsDir, DEFAULTS.assetsDir),
    plantUmlServerUrl: normalizeServerUrl(s.plantUmlServerUrl),
    diagramFitWidth: s.diagramFitWidth,
    mathEnabled: s.mathEnabled
  }
}

function normalizeConfigPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const clean = value.trim().replace(/^\/+|\/+$/g, '')
  if (!clean || clean.includes('..') || clean.includes('\\')) return fallback
  return clean
}

function normalizeServerUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULTS.plantUmlServerUrl
  const clean = value.trim().replace(/\/+$/g, '')
  if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(clean)) return DEFAULTS.plantUmlServerUrl
  return clean
}

/** Validate and coerce an untrusted parsed project config into a partial. */
export function sanitizeProjectConfig(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (Array.isArray(obj.enabledPlugins) && obj.enabledPlugins.every((v) => typeof v === 'string')) {
    out.enabledPlugins = obj.enabledPlugins as string[]
  }
  if (typeof obj.scheduleDir === 'string' && obj.scheduleDir.trim()) {
    out.scheduleDir = obj.scheduleDir.trim()
  }
  const hiddenFolders = normalizeHiddenFolderRules(obj.hiddenFolders)
  if (Array.isArray(obj.hiddenFolders) || hiddenFolders.length > 0) {
    out.hiddenFolders = hiddenFolders
  }
  if (typeof obj.assetsDir === 'string') out.assetsDir = normalizeConfigPath(obj.assetsDir, DEFAULTS.assetsDir)
  if (typeof obj.plantUmlServerUrl === 'string') out.plantUmlServerUrl = normalizeServerUrl(obj.plantUmlServerUrl)
  if (typeof obj.diagramFitWidth === 'boolean') out.diagramFitWidth = obj.diagramFitWidth
  if (typeof obj.mathEnabled === 'boolean') out.mathEnabled = obj.mathEnabled
  return out
}

const DEFAULTS: Settings = {
  enabledPlugins: ['builtin.outline', 'builtin.schedule'],
  scheduleDir: '日程',
  hiddenFolders: [],
  assetsDir: 'assets',
  plantUmlServerUrl: 'https://kroki.io',
  diagramFitWidth: true,
  mathEnabled: true
}

/**
 * One-time migration for pre-P5.4 `localStorage` payloads: they have a
 * legacy `scheduleEnabled: boolean` field and no `enabledPlugins`. Translate
 * `scheduleEnabled: false` into an `enabledPlugins` list with
 * `builtin.schedule` excluded, so an existing user who had disabled schedule
 * keeps it disabled after upgrading. A payload that already has
 * `enabledPlugins` (new format) or has no legacy field at all needs no
 * migration.
 */
export function migrateLegacyScheduleEnabled(parsed: Record<string, unknown>): Partial<Settings> {
  if ('enabledPlugins' in parsed) return {}
  if (parsed.scheduleEnabled === false) {
    return { enabledPlugins: DEFAULTS.enabledPlugins.filter((id) => id !== 'builtin.schedule') }
  }
  return {}
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return { ...DEFAULTS, ...parsed, ...migrateLegacyScheduleEnabled(parsed) }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

interface SettingsState extends Settings {
  setPluginEnabled(id: string, enabled: boolean): void
  setScheduleDir(dir: string): void
  setHiddenFolders(rules: string[]): void
  addHiddenFolder(rule: string): void
  removeHiddenFolder(rule: string): void
  setAssetsDir(dir: string): void
  setPlantUmlServerUrl(url: string): void
  setDiagramFitWidth(v: boolean): void
  setMathEnabled(v: boolean): void
  /**
   * Apply a (validated) project config loaded from a vault's `.margin/config.json`.
   * Updates the in-memory store only — does NOT touch global localStorage, which
   * holds the machine-wide defaults. Pass the result of `sanitizeProjectConfig`.
   */
  applyProjectConfig(partial: Partial<Settings>): void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setPluginEnabled: (id, enabled) => {
    const current = get().enabledPlugins
    const enabledPlugins = enabled
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((x) => x !== id)
    set({ enabledPlugins })
    persist({ ...get(), enabledPlugins })
    void emit(EV_SETTINGS_CHANGED, { enabledPlugins, _source: windowId })
  },
  setScheduleDir: (dir) => {
    const clean = dir.trim() || DEFAULTS.scheduleDir
    set({ scheduleDir: clean })
    persist({ ...get(), scheduleDir: clean })
    void emit(EV_SETTINGS_CHANGED, { scheduleDir: clean, _source: windowId })
  },
  setHiddenFolders: (rules) => {
    const hiddenFolders = normalizeHiddenFolderRules(rules)
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  addHiddenFolder: (rule) => {
    const normalized = normalizeFolderPathInput(rule)
    if (!normalized) return
    const hiddenFolders = normalizeHiddenFolderRules([...get().hiddenFolders, normalized])
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  removeHiddenFolder: (rule) => {
    const normalized = normalizeFolderPathInput(rule)
    const hiddenFolders = get().hiddenFolders.filter((value) => value !== normalized)
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  setAssetsDir: (dir) => {
    const assetsDir = normalizeConfigPath(dir, DEFAULTS.assetsDir)
    set({ assetsDir })
    persist({ ...get(), assetsDir })
    void emit(EV_SETTINGS_CHANGED, { assetsDir, _source: windowId })
  },
  setPlantUmlServerUrl: (url) => {
    const plantUmlServerUrl = normalizeServerUrl(url)
    set({ plantUmlServerUrl })
    persist({ ...get(), plantUmlServerUrl })
    void emit(EV_SETTINGS_CHANGED, { plantUmlServerUrl, _source: windowId })
  },
  setDiagramFitWidth: (diagramFitWidth) => {
    set({ diagramFitWidth })
    persist({ ...get(), diagramFitWidth })
    void emit(EV_SETTINGS_CHANGED, { diagramFitWidth, _source: windowId })
  },
  setMathEnabled: (mathEnabled) => {
    set({ mathEnabled })
    persist({ ...get(), mathEnabled })
    void emit(EV_SETTINGS_CHANGED, { mathEnabled, _source: windowId })
  },
  applyProjectConfig: (partial) => set(partial)
}))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/projectConfig.test.ts`
Expected: PASS，全部用例绿。

- [ ] **Step 5: 更新 useProjectConfig.test.tsx**

把 `test/useProjectConfig.test.tsx` 整个替换为：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, cleanup, waitFor } from '@testing-library/react'

const readProjectConfig = vi.fn()
const writeProjectConfig = vi.fn().mockResolvedValue(undefined)
const emit = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    readProjectConfig: (...a: unknown[]) => readProjectConfig(...a),
    writeProjectConfig: (...a: unknown[]) => writeProjectConfig(...a)
  }
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => emit(...args)
}))

import { useProjectConfig } from '@/hooks/useProjectConfig'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'

function Harness(): null {
  useProjectConfig()
  return null
}

beforeEach(() => {
  readProjectConfig.mockReset().mockResolvedValue(null)
  writeProjectConfig.mockReset().mockResolvedValue(undefined)
  emit.mockReset().mockResolvedValue(undefined)
  useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
  useSettingsStore.setState({
    enabledPlugins: ['builtin.outline', 'builtin.schedule'],
    scheduleDir: '日程',
    hiddenFolders: [],
    assetsDir: 'assets',
    plantUmlServerUrl: 'https://kroki.io',
    diagramFitWidth: true,
    mathEnabled: true
  })
})

afterEach(cleanup)

describe('useProjectConfig', () => {
  it('hydrates settings from a vault config when a vault opens', async () => {
    readProjectConfig.mockResolvedValue(
      JSON.stringify({ enabledPlugins: ['builtin.outline'], scheduleDir: 'Daily', hiddenFolders: ['.claude'] })
    )
    render(<Harness />)
    act(() => {
      useVaultStore.setState({ root: '/v' })
    })
    await waitFor(() => {
      expect(useSettingsStore.getState().scheduleDir).toBe('Daily')
    })
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline'])
    expect(useSettingsStore.getState().hiddenFolders).toEqual(['.claude'])
    expect(writeProjectConfig).not.toHaveBeenCalled()
  })

  it('writes project config when settings change with a vault open', async () => {
    render(<Harness />)
    act(() => {
      useVaultStore.setState({ root: '/v' })
    })
    await waitFor(() => expect(readProjectConfig).toHaveBeenCalled())

    act(() => {
      useSettingsStore.getState().setScheduleDir('Notes')
    })

    await waitFor(() => expect(writeProjectConfig).toHaveBeenCalled())
    const [root, json] = writeProjectConfig.mock.calls.at(-1)!
    expect(root).toBe('/v')
    expect(JSON.parse(json)).toEqual({
      enabledPlugins: ['builtin.outline', 'builtin.schedule'],
      scheduleDir: 'Notes',
      hiddenFolders: [],
      assetsDir: 'assets',
      plantUmlServerUrl: 'https://kroki.io',
      diagramFitWidth: true,
      mathEnabled: true
    })
  })

  it('does not write project config when no vault is open', async () => {
    render(<Harness />)
    act(() => {
      useSettingsStore.getState().setScheduleDir('Notes')
    })
    await Promise.resolve()
    expect(writeProjectConfig).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run test/projectConfig.test.ts test/useProjectConfig.test.tsx`
Expected: 两个文件全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores/settingsStore.ts test/projectConfig.test.ts test/useProjectConfig.test.tsx
git commit -m "feat(settings): scheduleEnabled 迁移为 enabledPlugins，支持通用插件开关"
```

---

## Task 2: usePluginHost — 消费 enabledPlugins，outline 也变为可关闭

**Files:**
- Modify: `src/renderer/src/hooks/usePluginHost.ts`
- Modify: `test/usePluginHost.test.tsx`
- Modify: `test/pluginHostIntegration-dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `Settings.enabledPlugins: string[]`、`setPluginEnabled(id, enabled)`。
- Produces: `usePluginHost(onOpenToday, onJumpToLine)` 签名不变；outline 和 schedule 两个插件现在对称地由 `enabledPlugins` 数组成员资格驱动（此前 outline 是无条件常驻，本任务起 outline 也可关闭）。

- [ ] **Step 1: 写失败测试**

把 `test/usePluginHost.test.tsx` 整个替换为：

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePluginHost } from '@/hooks/usePluginHost'
import { usePluginUiStore } from '@/stores/pluginUiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useVaultStore } from '@/stores/vaultStore'

const BOTH_ENABLED = ['builtin.outline', 'builtin.schedule']

afterEach(() => {
  cleanup()
  usePluginUiStore.setState({ sidebarPanels: [], statusItems: [] })
  useSettingsStore.setState({ enabledPlugins: BOTH_ENABLED, scheduleDir: '日程' })
  useVaultStore.getState().setTree([])
})

beforeEach(() => {
  useSettingsStore.setState({ enabledPlugins: BOTH_ENABLED, scheduleDir: '日程' })
})

describe('usePluginHost', () => {
  it('activates the outline plugin before the schedule plugin (tab order)', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const ids = usePluginUiStore.getState().sidebarPanels.map((p) => p.descriptor.id)
    expect(ids).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('activates only the outline plugin when builtin.schedule is not in enabledPlugins', async () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline'] })
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('activates only the schedule plugin when builtin.outline is not in enabledPlugins', async () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.schedule'] })
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.schedule')
  })

  it('deactivates the schedule plugin (outline stays) when builtin.schedule is removed from enabledPlugins', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
    })

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.outline')
  })

  it('deactivates the outline plugin (schedule stays) when builtin.outline is removed from enabledPlugins', async () => {
    renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.outline', false)
    })

    const panels = usePluginUiStore.getState().sidebarPanels
    expect(panels.length).toBe(1)
    expect(panels[0].descriptor.id).toBe('builtin.schedule')
  })

  it('unmounting the hook deactivates both plugins (no leaked panels)', async () => {
    const { unmount } = renderHook(() => usePluginHost(vi.fn(), vi.fn()))
    await act(async () => {})
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)
    await act(async () => {
      unmount()
      await new Promise((resolve) => queueMicrotask(resolve))
    })
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(0)
  })
})
```

（本次重写顺手清理了 P5.3 终审记录在案的 minor 债务：删除了那条名不副实的"calls onJumpToLine when the outline plugin invokes it"用例——它的真实断言只是"注册没抛错"，真正的端到端覆盖已经在 `test/pluginHostIntegration-dom.test.tsx` 里。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/usePluginHost.test.tsx`
Expected: FAIL —— `useSettingsStore.setState({ enabledPlugins: ... })` 目前不是 `Settings` 的字段（Task 1 已经改了 store 本身，但 `usePluginHost.ts` 还在读旧的 `scheduleEnabled`，且 outline 仍是无条件挂载），"activates only the outline plugin..." 等新用例会失败。

- [ ] **Step 3: 重写 usePluginHost.ts**

把 `src/renderer/src/hooks/usePluginHost.ts` 整个替换为：

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
 * `HostServices`. Activates/deactivates both built-in plugins as
 * `enabledPlugins` (settingsStore, P5.4) toggles — before P5.4 the outline
 * plugin was unconditional; PluginMarket now manages both the same way.
 *
 * The outline-activation effect is declared BEFORE the schedule-activation
 * effect so `pluginUiStore.sidebarPanels` always gets `builtin.outline`
 * pushed first when both are enabled — React runs a component's effect
 * setups in declaration order on mount, and `PluginHost.activate`'s
 * synchronous prefix (which includes the plugin's own
 * `ctx.ui.registerSidebarPanel` call) fully runs before the enclosing async
 * function yields at its first `await`, so this ordering is deterministic,
 * not a race. `OutlineDrawer` renders tabs in `sidebarPanels` order, so this
 * is what keeps "Outline" as the first tab.
 *
 * Each effect derives its own boolean from `enabledPlugins` (rather than
 * both depending on the whole array) so toggling one plugin doesn't
 * needlessly tear down and re-mount the other.
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
  const outlineEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.outline'))
  const scheduleEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.schedule'))
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
    if (!outlineEnabled) return
    void host.activate(createOutlinePlugin((line) => onJumpToLineRef.current(line)))
    return () => {
      void host.deactivate('builtin.outline')
    }
  }, [outlineEnabled])

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
Expected: PASS，6 个用例全绿。

- [ ] **Step 5: 更新 pluginHostIntegration-dom.test.tsx**

把 `test/pluginHostIntegration-dom.test.tsx` 整个替换为：

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
 * End-to-end integration coverage for P5.2/P5.3/P5.4: exercises the real
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
  useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })
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
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })

    render(<Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />)
    await act(async () => {})

    const tab = screen.getByRole('button', { name: 'Schedule' })
    expect(tab).toBeTruthy()

    fireEvent.click(tab)
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()
    expect(screen.getByLabelText('上个月')).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
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
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'], scheduleDir: '日程' })

    render(
      <React.StrictMode>
        <Harness onOpenToday={vi.fn()} onJumpToLine={vi.fn()} />
      </React.StrictMode>
    )
    await act(async () => {})
    await flushMicrotasks()

    expect(screen.getAllByRole('button', { name: 'Outline' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: 'Schedule' }).length).toBe(1)
    expect(usePluginUiStore.getState().sidebarPanels.length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    const now = new Date()
    expect(
      screen.getByText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`)
    ).toBeTruthy()

    await act(async () => {
      useSettingsStore.getState().setPluginEnabled('builtin.schedule', false)
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

Run: `pnpm vitest run test/usePluginHost.test.tsx test/pluginHostIntegration-dom.test.tsx`
Expected: 两个文件全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/hooks/usePluginHost.ts test/usePluginHost.test.tsx test/pluginHostIntegration-dom.test.tsx
git commit -m "feat(plugin-api): usePluginHost 消费 enabledPlugins，outline 亦可关闭"
```

---

## Task 3: App.tsx + SettingsPanel.tsx — 接线新字段，Switch 抽成 ui 原语

**Files:**
- Create: `src/renderer/src/components/ui/Switch.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: Task 1 的 `enabledPlugins`/`setPluginEnabled`。
- Produces: `Switch` 组件（`{ checked, onChange, label }` props），供 Task 5 的 `PluginMarket` 复用。`AppHeader`/`Sidebar` 的 `scheduleEnabled` prop 类型和取值来源不变（仍是纯布尔值，只是 `App.tsx` 里派生方式变了）——这两个组件本身零改动。

- [ ] **Step 1: 新建 Switch 原语**

创建 `src/renderer/src/components/ui/Switch.tsx`：

```tsx
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

/** A labeled on/off toggle. Styling comes from the `.app-switch` classes in index.css. */
export function Switch({ checked, onChange, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={['app-switch', checked ? 'app-switch-on' : 'app-switch-off'].join(' ')}
    >
      <span className="app-switch-thumb" />
    </button>
  )
}
```

这是把 `SettingsPanel.tsx` 里原有的本地 `AppSwitch` 组件原样搬出来（`.app-switch*` 这几个 CSS class 已经在 `index.css` 里全局定义，不需要新增样式），只是改了名字、挪了位置，方便 Task 5 的 `PluginMarket.tsx` 也能用。这一步本身没有测试文件——它的行为由 Step 3 里 `SettingsPanel.tsx` 现有的手感（未变化）间接覆盖，Task 5 会为 `PluginMarket` 里的用法单独写测试。

- [ ] **Step 2: App.tsx 改用 enabledPlugins 派生 scheduleEnabled**

在 `src/renderer/src/App.tsx` 里，把：

```ts
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
```

改为：

```ts
  const scheduleEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.schedule'))
```

这是本文件唯一需要改的一行——`<Sidebar scheduleEnabled={scheduleEnabled} .../>`、`<AppHeader scheduleEnabled={scheduleEnabled} .../>` 两处调用处的值不用动，因为它们消费的还是同一个布尔值变量名。

- [ ] **Step 3: SettingsPanel.tsx 改用 Switch + enabledPlugins**

在 `src/renderer/src/components/SettingsPanel.tsx` 里：

1. 顶部 import 里新增：

```ts
import { Switch } from '@/components/ui/Switch'
```

2. 删除本地定义的 `AppSwitchProps` interface 和 `AppSwitch` 函数（原第 115-134 行）——不再需要，行为完全由新建的 `Switch` 原语替代。

3. `GeneralTab` 函数内，把：

```ts
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled)
```

改为：

```ts
  const scheduleEnabled = useSettingsStore((s) => s.enabledPlugins.includes('builtin.schedule'))
```

并把：

```ts
  const setScheduleEnabled = useSettingsStore((s) => s.setScheduleEnabled)
```

改为：

```ts
  const setPluginEnabled = useSettingsStore((s) => s.setPluginEnabled)
```

4. 把日程开关那一行：

```tsx
        <AppSwitch checked={scheduleEnabled} onChange={setScheduleEnabled} label="启用日程功能" />
```

改为：

```tsx
        <Switch
          checked={scheduleEnabled}
          onChange={(v) => setPluginEnabled('builtin.schedule', v)}
          label="启用日程功能"
        />
```

5. 文件里其余 5 处 `<AppSwitch .../>`（`GeneralTab` 的图表自适应宽度、数学公式；`EditorTab` 的 Typewriter mode、Show markdown syntax、Spellcheck）原样改成 `<Switch .../>`，props 不变——纯改标签名。

- [ ] **Step 4: typecheck + 手动确认**

Run: `pnpm typecheck`
Expected: 无类型错误（`AppSwitch`/`setScheduleEnabled` 已无残留引用；`Switch`/`setPluginEnabled` 签名匹配）。

Run: `pnpm vitest run`
Expected: 全量测试仍然全绿（`SettingsPanel.tsx` 本身此前没有专门的 dom 测试文件，行为改动靠 typecheck + Task 5 的 PluginMarket 测试 + 后续手动验收共同覆盖）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/Switch.tsx src/renderer/src/App.tsx src/renderer/src/components/SettingsPanel.tsx
git commit -m "refactor(settings): Switch 抽成 ui 原语，App/SettingsPanel 接入 enabledPlugins"
```

---

## Task 4: builtin 插件补 description + 新建 manifest 目录

**Files:**
- Modify: `src/renderer/src/plugin-api/builtins/outlinePlugin.tsx`
- Modify: `src/renderer/src/plugin-api/builtins/schedulePlugin.tsx`
- Create: `src/renderer/src/plugin-api/builtins/registry.ts`
- Test: `test/builtinPluginRegistry.test.ts`

**Interfaces:**
- Consumes: `PluginManifest`（`plugin-api/types.ts`，未改动）、`createOutlinePlugin`/`createSchedulePlugin`（P5.2/P5.3，未改签名，只加了 manifest 里的 `description` 字段）。
- Produces: `BUILTIN_PLUGIN_MANIFESTS: PluginManifest[]`，供 Task 5 的 `PluginMarket` 消费。

- [ ] **Step 1: 写失败测试**

创建 `test/builtinPluginRegistry.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { BUILTIN_PLUGIN_MANIFESTS } from '@/plugin-api/builtins/registry'

describe('BUILTIN_PLUGIN_MANIFESTS', () => {
  it('lists the outline and schedule manifests, in that order', () => {
    expect(BUILTIN_PLUGIN_MANIFESTS.map((m) => m.id)).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('every manifest has a non-empty description and at least one permission', () => {
    for (const m of BUILTIN_PLUGIN_MANIFESTS) {
      expect(m.description).toBeTruthy()
      expect(m.permissions?.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/builtinPluginRegistry.test.ts`
Expected: FAIL — `@/plugin-api/builtins/registry` 模块不存在。

- [ ] **Step 3: 给两个 builtin 插件的 manifest 补 description**

在 `src/renderer/src/plugin-api/builtins/outlinePlugin.tsx` 里，把：

```ts
    manifest: {
      id: 'builtin.outline',
      name: '大纲',
      version: '0.1.0',
      permissions: ['ui.sidebar']
    },
```

改为：

```ts
    manifest: {
      id: 'builtin.outline',
      name: '大纲',
      version: '0.1.0',
      description: '在侧边栏展示当前文档的标题大纲，点击跳转到对应位置。',
      permissions: ['ui.sidebar']
    },
```

在 `src/renderer/src/plugin-api/builtins/schedulePlugin.tsx` 里，把：

```ts
    manifest: {
      id: 'builtin.schedule',
      name: '日程',
      version: '0.1.0',
      permissions: ['commands', 'ui.sidebar']
    },
```

改为：

```ts
    manifest: {
      id: 'builtin.schedule',
      name: '日程',
      version: '0.1.0',
      description: '按日期管理每日笔记，提供日历视图与快速跳转。',
      permissions: ['commands', 'ui.sidebar']
    },
```

（这两处改动不影响 `test/outlinePlugin.test.ts`/`test/schedulePlugin.test.ts` 里已有的断言——它们只 `toEqual` 检查 `id`/`permissions`，不涉及 `description`，无需同步修改那两个文件。）

- [ ] **Step 4: 新建 registry.ts**

创建 `src/renderer/src/plugin-api/builtins/registry.ts`：

```ts
import type { PluginManifest } from '../types'
import { createOutlinePlugin } from './outlinePlugin'
import { createSchedulePlugin } from './schedulePlugin'

/**
 * Static catalog of built-in plugin manifests (P5.4), for UI that needs to
 * list every known plugin regardless of activation state — e.g. PluginMarket,
 * which must show a plugin's toggle even while it's disabled.
 * `PluginHost.list()` intentionally only returns *active* plugins (it's a
 * lifecycle registry, not a catalog), so this is a separate, deliberately
 * small list next to it.
 *
 * Reading `.manifest` off a freshly-constructed plugin is side-effect-free —
 * only `activate()` touches the host/DOM — so calling each factory with a
 * no-op callback here is safe and avoids duplicating manifest data.
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
  createOutlinePlugin(() => {}).manifest,
  createSchedulePlugin(() => {}).manifest
]
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run test/builtinPluginRegistry.test.ts test/outlinePlugin.test.ts test/schedulePlugin.test.ts`
Expected: 三个文件全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/plugin-api/builtins/outlinePlugin.tsx src/renderer/src/plugin-api/builtins/schedulePlugin.tsx src/renderer/src/plugin-api/builtins/registry.ts test/builtinPluginRegistry.test.ts
git commit -m "feat(plugin-api): 补 outline/schedule manifest description，新增 BUILTIN_PLUGIN_MANIFESTS 目录"
```

---

## Task 5: PluginMarket.tsx — 真实数据 + 开关

**Files:**
- Modify: `src/renderer/src/components/PluginMarket.tsx`
- Test: `test/pluginMarket-dom.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `Switch`；Task 4 的 `BUILTIN_PLUGIN_MANIFESTS`；Task 1 的 `enabledPlugins`/`setPluginEnabled`。
- Produces: 无新导出——`PluginMarket` 的 `{ onBack }` props 不变。

- [ ] **Step 1: 写失败测试**

创建 `test/pluginMarket-dom.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginMarket } from '@/components/PluginMarket'
import { useSettingsStore } from '@/stores/settingsStore'

afterEach(() => {
  cleanup()
  useSettingsStore.setState({ enabledPlugins: ['builtin.outline', 'builtin.schedule'] })
})

describe('PluginMarket', () => {
  it('lists the real built-in plugins with their name, description, and permissions', () => {
    render(<PluginMarket onBack={() => {}} />)
    expect(screen.getByText('大纲')).toBeTruthy()
    expect(screen.getByText('日程')).toBeTruthy()
    expect(screen.getAllByText('侧边栏面板').length).toBe(2)
    expect(screen.getByText('命令')).toBeTruthy()
  })

  it('toggling a plugin off updates settingsStore.enabledPlugins', () => {
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: '关闭 日程' }))
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline'])
  })

  it('toggling a disabled plugin back on re-adds it to enabledPlugins', () => {
    useSettingsStore.setState({ enabledPlugins: ['builtin.outline'] })
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: '启用 日程' }))
    expect(useSettingsStore.getState().enabledPlugins).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('filters the list by search query (name or description)', () => {
    render(<PluginMarket onBack={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('搜索插件...'), { target: { value: '日历' } })
    expect(screen.queryByText('大纲')).toBeNull()
    expect(screen.getByText('日程')).toBeTruthy()
  })

  it('calls onBack when the close button is clicked', () => {
    let closed = false
    render(<PluginMarket onBack={() => { closed = true }} />)
    fireEvent.click(screen.getByLabelText('关闭插件市场'))
    expect(closed).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/pluginMarket-dom.test.tsx`
Expected: FAIL —— 当前 `PluginMarket.tsx` 还在用硬编码的 `PLUGINS` 假数组，找不到"大纲"/"日程"这些真实插件名，也没有 `role="switch"` 的开关。

- [ ] **Step 3: 重写 PluginMarket.tsx**

把 `src/renderer/src/components/PluginMarket.tsx` 整个替换为：

```tsx
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { BUILTIN_PLUGIN_MANIFESTS } from '@/plugin-api/builtins/registry'
import { useSettingsStore } from '@/stores/settingsStore'

interface PluginMarketProps {
  onBack: () => void
}

const CATEGORIES = [
  'Featured',
  'Editor',
  'Export',
  'Themes',
  'Sync & Backup',
  'Productivity'
] as const

const PERMISSION_LABELS: Record<string, string> = {
  commands: '命令',
  'vault.read': '读取文件库',
  'ui.sidebar': '侧边栏面板',
  'ui.status': '状态栏'
}

export function PluginMarket({ onBack }: PluginMarketProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>('Featured')
  const [query, setQuery] = useState('')
  const enabledPlugins = useSettingsStore((s) => s.enabledPlugins)
  const setPluginEnabled = useSettingsStore((s) => s.setPluginEnabled)

  const plugins = useMemo(() => {
    if (!query.trim()) return BUILTIN_PLUGIN_MANIFESTS
    const q = query.trim().toLowerCase()
    return BUILTIN_PLUGIN_MANIFESTS.filter(
      (m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <Modal open onClose={onBack}>
      <div
        className="flex h-[520px] w-[720px] max-w-[calc(100vw-32px)] overflow-hidden"
      >
        <div className="flex w-[200px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)] py-3">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[13px] font-semibold">Plugins</span>
            <button
              onClick={onBack}
              className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--text-faint)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
              aria-label="关闭插件市场"
            >
              <X size={14} />
            </button>
          </div>

          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'mx-2 flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
                activeCategory === cat
                  ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent)]'
                  : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              ].join(' ')}
            >
              {cat}
            </button>
          ))}

          <div className="mx-4 my-2 border-t border-[color:var(--border-soft)]" />
          <div className="px-4 py-1 text-[11.5px] font-medium text-[color:var(--text-faint)]">
            已安装 · {BUILTIN_PLUGIN_MANIFESTS.length}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-4 py-2.5">
            <Search size={14} className="flex-none text-[color:var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[color:var(--text-faint)]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
              内置插件
            </div>
            {plugins.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-[12.5px] text-[color:var(--text-faint)]">
                没有匹配的插件
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {plugins.map((manifest) => {
                  const enabled = enabledPlugins.includes(manifest.id)
                  return (
                    <div
                      key={manifest.id}
                      className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--bg-elev)] p-3"
                    >
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[color:var(--accent-soft)] font-[family-name:var(--mono)] text-[17px] font-semibold text-[color:var(--accent)]">
                        {manifest.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-[13px] font-semibold text-foreground">{manifest.name}</div>
                          <Switch
                            checked={enabled}
                            onChange={(v) => setPluginEnabled(manifest.id, v)}
                            label={`${enabled ? '关闭' : '启用'} ${manifest.name}`}
                          />
                        </div>
                        {manifest.description && (
                          <div className="mt-0.5 text-[11.5px] text-[color:var(--text-faint)]">{manifest.description}</div>
                        )}
                        {manifest.permissions && manifest.permissions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {manifest.permissions.map((p) => (
                              <span
                                key={p}
                                className="rounded-full bg-[color:var(--bg-hover)] px-2 py-0.5 text-[10.5px] text-[color:var(--text-dim)]"
                              >
                                {PERMISSION_LABELS[p] ?? p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

（`CATEGORIES` 侧栏和搜索框原样保留——第三方插件安装不在本期，这部分继续留作视觉骨架；`query` 现在真的会过滤 `plugins` 列表了，比之前"输入了但什么也不做"的假搜索框更完整，但这不是本任务重点，只是数据源换真之后顺带跑起来的行为。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/pluginMarket-dom.test.tsx`
Expected: PASS，5 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/PluginMarket.tsx test/pluginMarket-dom.test.tsx
git commit -m "feat(app): PluginMarket 接入真实插件目录，支持开关内置插件"
```

---

## Task 6: 全量回归 + 手动验收清单

**Files:** 无代码改动，仅验证。

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: 零错误。

- [ ] **Step 2: 全量测试**

Run: `pnpm vitest run`
Expected: 全绿，重点关注：
- `test/app-rerender.test.tsx`（App 顶层渲染次数基线不应回退）
- 本期新增/改动的测试文件：`projectConfig.test.ts`、`useProjectConfig.test.tsx`、`usePluginHost.test.tsx`、`pluginHostIntegration-dom.test.tsx`、`builtinPluginRegistry.test.ts`、`pluginMarket-dom.test.tsx`
- `test/fileTree-dom.test.tsx`（其中 `scheduleEnabled={false}` 直接传给 `Sidebar` 组件本身的 prop，与 settingsStore 字段改名无关，理论上不受影响——用于确认这个预期成立）

- [ ] **Step 3: 手动验收清单**（Tauri/demo 环境，人工执行）

Run: `pnpm demo`（或仓库现有的手感验收命令，与 P5.2/P5.3 收尾一致）

清单：
- 打开设置面板 → Plugins，能看到"大纲"和"日程"两张卡片，各自的描述和权限标签渲染正确。
- 关闭"日程"插件的开关：右侧抽屉的 Schedule tab 消失，`AppHeader`/`Sidebar` 的"今日日程"按钮也一起消失，无报错；重新打开后三者都恢复。
- 关闭"大纲"插件的开关：右侧抽屉的 Outline tab 消失（如果 Schedule 还开着，会自动切到 Schedule tab；如果两个都关了，抽屉应该是空的，不报错）。
- 设置面板"General"标签页里原来的"启用日程功能"开关和 Plugins 里"日程"插件的开关是同一个状态——切一个另一个应该同步反映。
- 关闭再重开 App（或新开一个窗口）：插件的开关状态应该保持（localStorage/`.margin/config.json` 持久化生效）。
- 如果本机 localStorage 里还留着 P5.2/P5.3 时代写入的旧版 `scheduleEnabled: false`（可以手动在 devtools 里塞一条模拟），刷新后"日程"插件的开关应该显示为关闭状态（一次性迁移生效），而不是意外被重置成默认开启。

（同时可以顺带把 P5.2/P5.3 遗留的手动验收清单一起做了：Outline/Schedule tab 像素一致性、reparent-not-remount 效果。）

---

## 风险与回退

| 风险 | 缓解 |
|------|------|
| `scheduleEnabled` → `enabledPlugins` 改名，已有用户 localStorage 里的旧字段被静默丢弃，日程设置意外重置 | Task 1 的 `migrateLegacyScheduleEnabled` 专门处理这个一次性迁移路径，且有专测覆盖四种输入组合 |
| `AppHeader`/`Sidebar` 消费 `scheduleEnabled` prop 的地方被连带改坏 | 刻意保持这两个组件的 prop 类型和取值完全不变，只改 `App.tsx` 里派生这个布尔值的表达式——`test/fileTree-dom.test.tsx` 里直接给 `Sidebar` 传 `scheduleEnabled={false}` 的测试不用动，作为这个约束成立的证据 |
| `usePluginHost` 里两个 effect 都依赖 `enabledPlugins` 整个数组引用，导致切换任一插件都触发另一个重新挂载（多余的挂卸载/画面闪烁） | 每个 effect 各自算出自己的布尔值（`enabledPlugins.includes(id)`）作为依赖项，而不是依赖整个数组——Task 2 的测试专门验证"关一个不影响另一个" |
| `BUILTIN_PLUGIN_MANIFESTS` 通过调用插件工厂函数（传空回调）来获取 manifest，如果 `activate()` 被不小心一起调用会有副作用 | 工厂函数本身（`createOutlinePlugin`/`createSchedulePlugin`）只是返回一个对象字面量，`activate` 只是对象上的一个函数属性，不会在构造时被调用——registry.ts 的 JSDoc 里写明了这个前提，Task 4 的测试也隐含验证了这一点（没有真的挂载任何 DOM） |

## 自审记录（writing-plans Self-Review）

- **spec 覆盖**：主计划 Task 5.4 的字面要求——① 删除硬编码 `PLUGINS` 数组，列表来自真实数据源（Task 4 的 `BUILTIN_PLUGIN_MANIFESTS` + Task 5 消费）② 启用/禁用调用 host 的激活/停用（Task 2 让 `usePluginHost` 响应式地做这件事，Task 5 只需要写 settingsStore，不需要直接持有 `PluginHost` 实例）③ 状态持久化到 settingsStore 的 `enabledPlugins: string[]`（Task 1）④ 第三方插件安装不在本期（未做，`CATEGORIES`/搜索框保留为视觉骨架）。经用户确认的架构决策——`scheduleEnabled` 重命名为 `enabledPlugins`、outline 也变为可关闭——已落实在 Task 1/2。✓
- **占位符检查**：全文无 TBD/待补，每个 Step 都有完整代码或精确的逐行编辑指令（App.tsx/SettingsPanel.tsx 用 before/after 片段而非整文件重写，因为改动点稀疏、文件本身很长，但每处编辑都是逐字精确的，不是"照着改改"这种模糊指代）。✓
- **类型一致性**：`Settings.enabledPlugins: string[]`（Task 1 定义 → Task 2 `usePluginHost` 消费 → Task 3 `App.tsx`/`SettingsPanel.tsx` 消费 → Task 5 `PluginMarket` 消费，四处字段名和类型完全一致）；`setPluginEnabled(id: string, enabled: boolean): void`（Task 1 定义 → Task 3/Task 5 两处消费，签名一致）；`Switch({ checked, onChange, label })`（Task 3 定义 → Task 5 消费，props 一致）；`BUILTIN_PLUGIN_MANIFESTS: PluginManifest[]`（Task 4 定义 → Task 5 消费，`PluginManifest` 类型来自未改动的 `plugin-api/types.ts`）。✓
