import { useEffect, useState } from 'react'
import { computeStats, type DocStats } from '@/lib/computeStats'

const DEBOUNCE_MS = 200

/**
 * Compute document stats for `content`, debounced so typing doesn't recompute on
 * every keystroke. Returns the latest settled stats.
 */
export function useDocStats(content: string): DocStats {
  const [stats, setStats] = useState<DocStats>(() => computeStats(content))

  useEffect(() => {
    const timer = setTimeout(() => setStats(computeStats(content)), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [content])

  return stats
}
