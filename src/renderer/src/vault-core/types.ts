import type { TreeNode } from '../../../shared/ipc'

/**
 * vault-core contracts (ROADMAP P0.2). Stable, UI-agnostic models for the vault
 * and its file tree, consumed by React today and (later) Swift/iOS. The Rust
 * shell produces the raw `TreeNode[]`; everything here is pure derivation.
 */

/** A node in the vault tree (re-exported so consumers depend on vault-core, not IPC). */
export type VaultNode = TreeNode

/** An immutable snapshot of a scanned vault. */
export interface VaultSnapshot {
  root: string
  tree: VaultNode[]
}

/** A requested change to the vault, independent of how the shell executes it. */
export type VaultOperation =
  | { kind: 'create-note'; dir: string; name: string }
  | { kind: 'create-folder'; dir: string; name: string }
  | { kind: 'rename'; path: string; newName: string }
  | { kind: 'move'; path: string; destDir: string }
  | { kind: 'trash'; path: string }

/** A change that happened to the vault, for stores/tabs/cross-window sync. */
export type VaultEvent =
  | { type: 'created'; path: string }
  | { type: 'renamed'; from: string; to: string }
  | { type: 'moved'; from: string; to: string }
  | { type: 'trashed'; path: string }
  | { type: 'changed'; path: string }

/** The concrete source→target a rename/move resolves to (before conflict-suffixing). */
export interface PathPlan {
  from: string
  to: string
}
