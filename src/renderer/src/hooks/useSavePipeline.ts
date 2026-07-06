import { useRef, useEffect } from 'react'
import { saveDocument, waitForDocumentSaves as libWaitForDocumentSaves } from '@/lib/saveDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { isAffectedPath, pathMutationGuardFor } from '@/lib/pathMutationGuards'
import { api } from '@/lib/api'

const AUTOSAVE_MS = 800

export interface SavePipeline {
  scheduleSave(path: string): void
  flushSaves(): Promise<void>
  pauseForPaths(paths: string[]): void
  resumeAfterMutation(oldPath: string, newPath: string | null): void
  waitForDocumentSaves(paths: string[]): Promise<void>
}

/**
 * Manages the 800ms debounced autosave queue.
 * Migrated verbatim from App.tsx:263-355; semantics are preserved exactly.
 *
 * Pause/resume cycle (used by rename/move/trash transactions):
 *   pauseForPaths(paths)           – pull affected paths off the timer
 *   ... IPC mutation ...
 *   resumeAfterMutation(old, new)  – re-queue with new path (or discard if null)
 */
export function useSavePipeline(): SavePipeline {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerPaths = useRef<string[]>([])

  // Paused paths are accumulated here between pauseForPaths and
  // resumeAfterMutation.  We use a ref so pause/resume calls are stable and
  // don't require re-renders.
  const pausedPaths = useRef<string[]>([])

  // Clean up the timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      saveTimerPaths.current = []
    }
  }, [])

  function uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths))
  }

  function clearTimer(): void {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    saveTimerPaths.current = []
  }

  /**
   * Core scheduler: merges `paths` with any already-queued paths, filters
   * blocked and clean paths, then arms (or re-arms) the 800ms timer.
   *
   * Paths that are currently covered by an active PathMutationGuard are
   * stashed in the guard's `blockedPaths` list instead of being scheduled.
   */
  function scheduleDirtyAffectedTabsSave(paths: string[]): void {
    const candidates = uniquePaths([...saveTimerPaths.current, ...paths])
    if (saveTimer.current) clearTimeout(saveTimer.current)

    const schedulableCandidates: string[] = []
    for (const nextPath of candidates) {
      const guard = pathMutationGuardFor(nextPath)
      if (guard) guard.blockedPaths = uniquePaths([...guard.blockedPaths, nextPath])
      else schedulableCandidates.push(nextPath)
    }

    const dirtyPaths = schedulableCandidates.filter((nextPath) => {
      const tab = useDocumentStore.getState().tabForPath(nextPath)
      return tab != null && tab.content !== tab.savedContent
    })

    if (dirtyPaths.length === 0) {
      saveTimer.current = null
      saveTimerPaths.current = []
      return
    }

    saveTimerPaths.current = dirtyPaths
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      saveTimerPaths.current = []
      dirtyPaths.forEach((nextPath) =>
        void saveDocument(api.writeFile, api.readFile, nextPath)
      )
    }, AUTOSAVE_MS)
  }

  /**
   * Queue a debounced save for the given path.
   * Multiple calls within 800ms are coalesced into a single write.
   */
  function scheduleSave(path: string): void {
    scheduleDirtyAffectedTabsSave([path])
  }

  /**
   * Immediately flush all pending saves and wait for them to complete.
   * Used for ⌘S and before window close.
   */
  async function flushSaves(): Promise<void> {
    const pathsToFlush = uniquePaths(saveTimerPaths.current)
    clearTimer()
    const promises = pathsToFlush.map((p) =>
      saveDocument(api.writeFile, api.readFile, p)
    )
    await Promise.all(promises)
  }

  /**
   * Pause any pending saves whose paths are affected by `paths`.
   * The affected paths are lifted off the timer; unaffected paths are
   * immediately re-scheduled.  Call resumeAfterMutation when the
   * mutation is complete (or abandoned).
   *
   * Corresponds to App.tsx::pausePendingSaveIfAffected, generalised to
   * accept multiple base paths.
   */
  function pauseForPaths(paths: string[]): void {
    if (!saveTimer.current) {
      pausedPaths.current = []
      return
    }

    const newlyPaused: string[] = []
    const unaffected: string[] = []

    for (const queuedPath of uniquePaths(saveTimerPaths.current)) {
      const isAffected = paths.some((base) => isAffectedPath(queuedPath, base))
      if (isAffected) newlyPaused.push(queuedPath)
      else unaffected.push(queuedPath)
    }

    if (newlyPaused.length === 0) {
      // Nothing to pause – leave timer alone.
      pausedPaths.current = []
      return
    }

    clearTimer()
    pausedPaths.current = newlyPaused

    // Re-schedule paths that are not affected by the mutation.
    if (unaffected.length > 0) scheduleDirtyAffectedTabsSave(unaffected)
  }

  /**
   * Resume (or discard) the paused saves after a path mutation completes.
   *
   * - newPath !== null → rename/move succeeded: re-queue with new path
   *   (tabs have already been updated via replacePath before this call)
   * - newPath === null → trash succeeded: discard the paused paths entirely
   *
   * Also re-queues any paths that were blocked by PathMutationGuard during
   * the mutation window — mirrors App.tsx::restorePausedAndBlockedSave.
   *
   * @param oldPath   The base path before the mutation
   * @param newPath   The new base path, or null to discard
   */
  function resumeAfterMutation(oldPath: string, newPath: string | null): void {
    const toResume: string[] = []

    if (newPath !== null) {
      // Remap paused paths from old prefix to new prefix.
      for (const p of pausedPaths.current) {
        if (isAffectedPath(p, oldPath)) {
          toResume.push(`${newPath}${p.slice(oldPath.length)}`)
        } else {
          toResume.push(p)
        }
      }
    }
    // If newPath === null we simply drop all paused paths (trash scenario).

    pausedPaths.current = []
    if (toResume.length > 0) scheduleDirtyAffectedTabsSave(toResume)
  }

  /**
   * Wait until all in-flight saveDocument calls for `paths` have settled.
   * Thin wrapper around the module-level waitForDocumentSaves from saveDocument.ts.
   */
  async function waitForDocumentSaves(paths: string[]): Promise<void> {
    await libWaitForDocumentSaves(paths)
  }

  return {
    scheduleSave,
    flushSaves,
    pauseForPaths,
    resumeAfterMutation,
    waitForDocumentSaves
  }
}
