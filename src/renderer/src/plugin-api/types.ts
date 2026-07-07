import type { VaultSnapshot, VaultEvent } from '@/vault-core'

/**
 * plugin-api contracts (ROADMAP P0.4). Plugins reach the app only through this
 * facade — never the Zustand store, a CodeMirror instance, Tauri invoke, or the
 * raw filesystem. High-risk capabilities must be declared as {@link Permission}s
 * and are gated by the host.
 */

export interface Disposable {
  dispose(): void
}

/**
 * Declarable capabilities; the host throws if a plugin uses one it didn't declare.
 * Every permission listed here has a real require() gate in PluginHost.buildContext.
 * Permissions without an enforced gate are intentionally omitted (宁缺毋滥).
 */
export type Permission = 'commands' | 'vault.read' | 'ui.sidebar' | 'ui.status'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  permissions?: Permission[]
}

/** A command a plugin contributes into the app's command registry. */
export interface CommandContribution {
  id: string
  title: string
  category?: string
  keybinding?: string
  run: () => void | Promise<void>
}

/** A sidebar panel contributed by a plugin. Requires `ui.sidebar` permission. */
export interface SidebarPanelContribution {
  id: string
  title: string
  /** Lucide icon name. */
  icon: string
  /** Mount the panel into `container`; return a dispose function to unmount. */
  render(container: HTMLElement): () => void
}

/** A status-bar item contributed by a plugin. Requires `ui.status` permission. */
export interface StatusItemContribution {
  id: string
  render(): string
}

/** The capability facade handed to a plugin at activation. */
export interface PluginContext {
  manifest: PluginManifest
  /** Requires the `commands` permission. */
  commands: { register(contribution: CommandContribution): Disposable }
  /** Requires the `vault.read` permission. */
  vault: { snapshot(): VaultSnapshot }
  /** Subscribe to vault events. Requires the `vault.read` permission. */
  events: { on(type: VaultEvent['type'], handler: (event: VaultEvent) => void): Disposable }
  /** UI contribution points. */
  ui: {
    /** Requires the `ui.sidebar` permission. */
    registerSidebarPanel(panel: SidebarPanelContribution): Disposable
    /** Requires the `ui.status` permission. */
    registerStatusItem(item: StatusItemContribution): Disposable
  }
}

export interface MarginPlugin {
  manifest: PluginManifest
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}
