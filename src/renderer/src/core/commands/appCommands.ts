/**
 * core/commands/appCommands — app-level global commands (ROADMAP P0.3).
 *
 * Ctx = void: unlike `editorCommands` (Ctx = EditorView), these commands act on
 * module-level singletons (`uiStore`) or window-lifecycle helpers, not a
 * per-call context object. Keeping them in the registry (rather than inline in
 * App.tsx) lets `useGlobalKeymap` and the future command palette (⌘P) share the
 * same ids.
 */
import { useUiStore } from '@/stores/uiStore'
import { createPeerWindow } from '@/lib/windowManager'
import type { CommandDef } from './registry'

export const appCommands: CommandDef<void>[] = [
  {
    id: 'sidebar.toggle',
    title: '切换侧栏',
    category: '视图',
    keybinding: 'Mod-b',
    run: () => useUiStore.getState().toggleSidebar()
  },
  {
    id: 'outline.toggle',
    title: '切换大纲',
    category: '视图',
    keybinding: 'Mod-\\',
    run: () => useUiStore.getState().toggleDrawer()
  },
  {
    id: 'settings.open',
    title: '打开设置',
    category: '应用',
    keybinding: 'Mod-,',
    run: () => useUiStore.getState().toggleSettings()
  },
  {
    id: 'search.open',
    title: '打开搜索',
    category: '应用',
    keybinding: 'Mod-k',
    run: () => useUiStore.getState().toggleSearch()
  },
  {
    id: 'window.new',
    title: '新建窗口',
    category: '窗口',
    keybinding: 'Mod-Shift-n',
    // Opens a fresh, blank peer window — NOT a new note. See @/lib/windowManager.
    run: () => createPeerWindow()
  }
]
