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
