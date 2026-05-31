import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * Subscribe to the OS dark-mode preference. On Electron renderer this tracks
 * macOS appearance automatically — no IPC / nativeTheme needed.
 */
export function useSystemTheme(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent): void => setDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return dark
}
