import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

export const DRAFT_INTERVAL_MS = 2000

/**
 * Crash-recovery drafts are tracked per open dirty tab. Failures stay silent so
 * draft persistence never interrupts editing.
 */
export function useDraft(): void {
  useEffect(() => {
    const lastWritten = new Map<string, string>()

    const timer = setInterval(() => {
      const root = useVaultStore.getState().root
      if (!root) return
      for (const tab of useDocumentStore.getState().dirtyTabs()) {
        if (tab.content === lastWritten.get(tab.path)) continue
        lastWritten.set(tab.path, tab.content)
        void api.writeDraft(root, tab.path, tab.content).catch(() => {})
      }
    }, DRAFT_INTERVAL_MS)

    const unsub = useDocumentStore.subscribe((s, prev) => {
      const root = useVaultStore.getState().root
      if (!root) return

      for (const tab of s.tabs) {
        const previous = prev.tabs.find((item) => item.path === tab.path)
        if (previous && tab.saveStatus === 'saved' && previous.saveStatus !== 'saved') {
          lastWritten.delete(tab.path)
          void api.deleteDraft(root, tab.path).catch(() => {})
        }
      }
      for (const previous of prev.tabs) {
        if (!s.tabs.some((tab) => tab.path === previous.path)) {
          lastWritten.delete(previous.path)
        }
      }
    })

    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])
}
