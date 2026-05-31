import { Monitor, Moon, Sun } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'

const LABEL: Record<ThemeMode, string> = {
  auto: 'Theme: follow system (click to lock light)',
  light: 'Theme: light (click to lock dark)',
  dark: 'Theme: dark (click to follow system)'
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
      className="grid h-[26px] w-[30px] place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon size={16} />
    </button>
  )
}
