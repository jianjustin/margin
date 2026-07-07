/**
 * plugin-api — plugin contracts + host (ROADMAP P0.4).
 *
 * Plugins access the app only through a permission-gated facade
 * ({@link PluginContext}); the {@link PluginHost} activates them, enforces
 * declared permissions, and disposes everything they register on unload. The
 * facade currently exposes `commands`, `vault` (read-only snapshot), and vault
 * `events`; more contribution points (decorations, panels, status items) extend
 * the same surface.
 */
export type {
  Disposable,
  Permission,
  PluginManifest,
  CommandContribution,
  SidebarPanelContribution,
  StatusItemContribution,
  PluginContext,
  MarginPlugin
} from './types'

export { EventBus } from './eventBus'
export { PluginHost } from './host'
export type { HostServices, CommandSink, UiSink } from './host'

export { createVaultInfoPlugin } from './builtins/vaultInfoPlugin'
