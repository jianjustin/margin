/**
 * plugin-api — plugin contracts + host (ROADMAP P0.4).
 *
 * Plugins access the app only through a permission-gated facade
 * ({@link PluginContext}); the {@link PluginHost} activates them, enforces
 * declared permissions, and disposes everything they register on unload. The
 * facade exposes `commands`, `vault` (read-only snapshot), vault `events`, and
 * `ui` (sidebar panels + status items); further contribution points extend the
 * same surface.
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
