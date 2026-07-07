import type { VaultSnapshot } from '@/vault-core'
import type {
  CommandContribution,
  Disposable,
  MarginPlugin,
  Permission,
  PluginContext,
  PluginManifest,
  SidebarPanelContribution,
  StatusItemContribution
} from './types'
import type { EventBus } from './eventBus'

/** Where contributed commands land (the app adapts its CommandRegistry to this). */
export interface CommandSink {
  register(contribution: CommandContribution): Disposable
}

/** Where sidebar panels land (the app provides the real implementation). */
export interface UiSink {
  registerSidebarPanel(panel: SidebarPanelContribution): Disposable
  registerStatusItem(item: StatusItemContribution): Disposable
}

/** Services the host wires the plugin facade onto. */
export interface HostServices {
  commands: CommandSink
  vaultSnapshot: () => VaultSnapshot
  events: EventBus
  ui: UiSink
}

interface ActiveRecord {
  plugin: MarginPlugin
  disposables: Disposable[]
}

/**
 * Loads, activates, and tears down plugins (ROADMAP P0.4). Each plugin gets a
 * permission-gated {@link PluginContext}; any capability the manifest didn't
 * declare throws when used. Everything a plugin registers is tracked and
 * disposed on deactivation, so unloading a plugin fully removes its footprint.
 */
export class PluginHost {
  private readonly active = new Map<string, ActiveRecord>()

  constructor(private readonly services: HostServices) {}

  async activate(plugin: MarginPlugin): Promise<void> {
    const { id } = plugin.manifest
    if (this.active.has(id)) throw new Error(`plugin already active: ${id}`)
    const disposables: Disposable[] = []
    const ctx = this.buildContext(plugin.manifest, disposables)
    // Register before awaiting so a synchronous throw still leaves no partial state.
    this.active.set(id, { plugin, disposables })
    try {
      await plugin.activate(ctx)
    } catch (err) {
      disposables.forEach((d) => d.dispose())
      this.active.delete(id)
      throw err
    }
  }

  async deactivate(id: string): Promise<void> {
    const record = this.active.get(id)
    if (!record) return
    this.active.delete(id)
    record.disposables.forEach((d) => d.dispose())
    await record.plugin.deactivate?.()
  }

  isActive(id: string): boolean {
    return this.active.has(id)
  }

  list(): PluginManifest[] {
    return [...this.active.values()].map((r) => r.plugin.manifest)
  }

  private buildContext(manifest: PluginManifest, disposables: Disposable[]): PluginContext {
    const granted = new Set<Permission>(manifest.permissions ?? [])
    const require = (permission: Permission): void => {
      if (!granted.has(permission)) {
        throw new Error(`plugin ${manifest.id} lacks permission: ${permission}`)
      }
    }
    const track = (d: Disposable): Disposable => {
      disposables.push(d)
      return d
    }

    return {
      manifest,
      commands: {
        register: (contribution) => {
          require('commands')
          return track(this.services.commands.register(contribution))
        }
      },
      vault: {
        snapshot: () => {
          require('vault.read')
          return this.services.vaultSnapshot()
        }
      },
      events: {
        on: (type, handler) => {
          require('vault.read')
          return track(this.services.events.on(type, handler))
        }
      },
      ui: {
        registerSidebarPanel: (panel) => {
          require('ui.sidebar')
          return track(this.services.ui.registerSidebarPanel(panel))
        },
        registerStatusItem: (item) => {
          require('ui.status')
          return track(this.services.ui.registerStatusItem(item))
        }
      }
    }
  }
}
