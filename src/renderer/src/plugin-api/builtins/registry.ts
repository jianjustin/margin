import type { PluginManifest } from '../types'
import { createOutlinePlugin } from './outlinePlugin'
import { createSchedulePlugin } from './schedulePlugin'

/**
 * Static catalog of built-in plugin manifests (P5.4), for UI that needs to
 * list every known plugin regardless of activation state — e.g. PluginMarket,
 * which must show a plugin's toggle even while it's disabled.
 * `PluginHost.list()` intentionally only returns *active* plugins (it's a
 * lifecycle registry, not a catalog), so this is a separate, deliberately
 * small list next to it.
 *
 * Reading `.manifest` off a freshly-constructed plugin is side-effect-free —
 * only `activate()` touches the host/DOM — so calling each factory with a
 * no-op callback here is safe and avoids duplicating manifest data.
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
  createOutlinePlugin(() => {}).manifest,
  createSchedulePlugin(() => {}).manifest
]
