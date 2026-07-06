import { useEffect } from 'react'
import { CommandRegistry } from '@/core/commands/registry'
import { appCommands } from '@/core/commands/appCommands'

/**
 * Global keyboard shortcuts (⌘B / ⌘\ / ⌘, / ⌘K / ⌘⇧N), moved out of App.tsx.
 *
 * Each combo dispatches through a `CommandRegistry` by id instead of calling
 * store actions / window helpers directly, so the same commands can later be
 * driven by a command palette (⌘P) or menu without duplicating the bindings.
 *
 * Behavior is preserved exactly from the App.tsx keydown handler this
 * replaces: same key matching (including case-sensitive 'N' for ⌘⇧N) and the
 * same `preventDefault()` on every matched combo. The original handler had no
 * input-field / IME guards to carry over.
 */
export function useGlobalKeymap(): void {
  useEffect(() => {
    const registry = new CommandRegistry<void>()
    const disposer = registry.registerAll(appCommands)

    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        void registry.run('sidebar.toggle', undefined)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        void registry.run('outline.toggle', undefined)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        void registry.run('settings.open', undefined)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        void registry.run('search.open', undefined)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        void registry.run('window.new', undefined)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      disposer.dispose()
    }
  }, [])
}
