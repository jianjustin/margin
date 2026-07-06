import { FolderOpen, PanelLeft, PanelRight, SlidersHorizontal } from 'lucide-react'
import { CalendarDayIcon } from '@/components/icons/CalendarDayIcon'

interface AppHeaderProps {
  sidebarOpen: boolean
  drawerOpen: boolean
  scheduleEnabled: boolean
  onToggleSidebar: () => void
  onOpenFolder: () => void
  onOpenToday: () => void
  onOpenSettings: () => void
  onToggleDrawer: () => void
}

/**
 * The window title-bar toolbar: sidebar toggle, open-folder, today-schedule,
 * settings, and outline-drawer buttons. Purely presentational — every action
 * arrives as a prop, so App (the assembly layer) owns the store dispatches.
 */
export function AppHeader({
  sidebarOpen,
  drawerOpen,
  scheduleEnabled,
  onToggleSidebar,
  onOpenFolder,
  onOpenToday,
  onOpenSettings,
  onToggleDrawer
}: AppHeaderProps): JSX.Element {
  return (
    <header
      data-tauri-drag-region
      className={[
        'flex h-[46px] shrink-0 items-center justify-between border-b border-[color:var(--toolbar-border)] bg-[color:var(--bg-elev)] px-[10px] text-sm text-[color:var(--text-faint)]',
        sidebarOpen ? '' : 'pl-20'
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? '隐藏文件树 (⌘B)' : '显示文件树 (⌘B)'}
          aria-label={sidebarOpen ? '隐藏文件树' : '显示文件树'}
          className={[
            'grid h-[27px] w-[28px] place-items-center rounded-[7px] transition-colors',
            sidebarOpen
              ? 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
              : 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
          ].join(' ')}
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={onOpenFolder}
          title="打开文件夹"
          aria-label="打开文件夹"
          className="grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <FolderOpen size={16} />
        </button>
      </div>

      <div data-tauri-drag-region className="min-w-0 flex-1" />

      <div className="relative flex flex-1 justify-end gap-1 [-webkit-app-region:no-drag]">
        {scheduleEnabled && (
          <button
            onClick={onOpenToday}
            title="今日日程"
            aria-label="今日日程"
            className="relative grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
          >
            <CalendarDayIcon day={new Date().getDate()} />
          </button>
        )}
        <button
          onClick={onOpenSettings}
          title="设置 (⌘,)"
          aria-label="设置"
          className="grid h-[27px] w-[28px] place-items-center rounded-[7px] text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          onClick={onToggleDrawer}
          title="大纲 (⌘\)"
          aria-label="切换大纲"
          className={[
            'grid h-[27px] w-[28px] place-items-center rounded-[7px] transition-colors',
            drawerOpen
              ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
              : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground'
          ].join(' ')}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  )
}
