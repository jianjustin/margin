import { api } from '@/lib/api'
import { normalizeHiddenFolderRules } from '@/lib/folderRules'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TreeNode } from '../../../shared/ipc'

export function currentHiddenFolders(): string[] {
  return normalizeHiddenFolderRules(useSettingsStore.getState().hiddenFolders)
}

export function scanVaultWithSettings(root: string): Promise<TreeNode[]> {
  return api.scanVault(root, currentHiddenFolders())
}
