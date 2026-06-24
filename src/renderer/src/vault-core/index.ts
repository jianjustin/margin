/**
 * vault-core — vault model + file-tree kernel (ROADMAP P0.2).
 *
 * Pure, UI-agnostic derivation over the raw `TreeNode[]` the Rust shell scans:
 * tree queries/sort/filter/flatten, path policy (Obsidian-safe), and
 * rename/move/unique-name planning. The file-tree UI consumes these instead of
 * reaching into the Zustand store or Tauri commands directly.
 *
 * Side-effects (scanning, fs writes, watchers) stay in the shell; vault-core
 * only computes.
 */
export type { VaultNode, VaultSnapshot, VaultOperation, VaultEvent, PathPlan } from './types'

export { flattenTree, findNode, allPaths, sortNodes, siblingNames, filterTree } from './fileTree'
export type { FlatRow } from './fileTree'

export {
  UNSAFE_SEGMENTS,
  isPathSafe,
  assertSafePath,
  dirname,
  basename,
  joinPath,
  splitExt,
  uniqueName,
  renamePlan,
  movePlan
} from './path'
