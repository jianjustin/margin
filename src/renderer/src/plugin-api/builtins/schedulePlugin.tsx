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
      description: '按日期管理每日笔记，提供日历视图与快速跳转。',
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
