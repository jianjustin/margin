import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

export const DRAFT_INTERVAL_MS = 2000

/**
 * Crash-recovery drafts: while the document is dirty, snapshot unsaved content
 * into `<vault>/.margin/drafts/` every couple of seconds; drop the draft once
 * the document is saved. All failures are silent — drafts must never interrupt
 * typing.
 */
export function useDraft(): void {
  useEffect(() => {
    let lastWritten: string | null = null

    const timer = setInterval(() => {
      const root = useVaultStore.getState().root
      const { path, content, savedContent } = useDocumentStore.getState()
      if (!root || !path || content === savedContent || content === lastWritten) return
      lastWritten = content
      void api.writeDraft(root, path, content).catch(() => {})
    }, DRAFT_INTERVAL_MS)

    const unsub = useDocumentStore.subscribe((s, prev) => {
      if (s.path && s.saveStatus === 'saved' && prev.saveStatus !== 'saved') {
        const root = useVaultStore.getState().root
        if (root) void api.deleteDraft(root, s.path).catch(() => {})
      }
    })

    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])
}
