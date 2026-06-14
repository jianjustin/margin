import { Monitor, Moon, Sun } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'

const LABEL: Record<ThemeMode, string> = {
  auto: '切换主题',
  light: '切换主题',
  dark: '切换主题'
}

export function ThemeToggle(): JSX.Element {
  const mode = useThemeStore((s) => s.mode)
  const cycleMode = useThemeStore((s) => s.cycleMode)

  const Icon = mode === 'auto' ? Monitor : mode === 'light' ? Sun : Moon

  return (
    <button
      onClick={cycleMode}
      title={LABEL[mode]}
      aria-label={LABEL[mode]}
      className="grid h-[24px] w-[28px] place-items-center rounded-md text-[color:var(--text-dim)] transition-colors hover:bg-[color:var(--bg-hover)] hover:text-foreground"
    >
      <Icon size={16} />
    </button>
  )
}
