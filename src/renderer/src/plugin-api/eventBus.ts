import type { VaultEvent } from '@/vault-core'
import type { Disposable } from './types'

/** A tiny typed pub/sub used to fan vault events out to plugins. */
export class EventBus {
  private readonly handlers = new Map<VaultEvent['type'], Set<(e: VaultEvent) => void>>()

  on(type: VaultEvent['type'], handler: (e: VaultEvent) => void): Disposable {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return { dispose: () => set!.delete(handler) }
  }

  emit(event: VaultEvent): void {
    this.handlers.get(event.type)?.forEach((h) => h(event))
  }
}
