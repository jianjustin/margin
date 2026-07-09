import { create } from 'zustand'
import type { SidebarPanelContribution, StatusItemContribution } from '@/plugin-api'

/** A sidebar panel that has already been rendered into a detached container. */
export interface RegisteredSidebarPanel {
  descriptor: SidebarPanelContribution
  container: HTMLElement
}

interface PluginUiState {
  sidebarPanels: RegisteredSidebarPanel[]
  statusItems: StatusItemContribution[]
  addSidebarPanel: (panel: RegisteredSidebarPanel) => void
  removeSidebarPanel: (id: string) => void
  addStatusItem: (item: StatusItemContribution) => void
  removeStatusItem: (id: string) => void
}

/**
 * Backing store for the app's real `UiSink` (plugin-api/host.ts). Registration
 * renders eagerly into a detached container (see usePluginHost); consumers
 * (OutlineDrawer) only reparent that container into visible DOM when its tab
 * is active — the container itself, and any React state inside it, survives
 * tab switches and is only torn down when the panel is removed here.
 */
export const usePluginUiStore = create<PluginUiState>((set) => ({
  sidebarPanels: [],
  statusItems: [],
  addSidebarPanel: (panel) => set((s) => ({ sidebarPanels: [...s.sidebarPanels, panel] })),
  removeSidebarPanel: (id) =>
    set((s) => ({ sidebarPanels: s.sidebarPanels.filter((p) => p.descriptor.id !== id) })),
  addStatusItem: (item) => set((s) => ({ statusItems: [...s.statusItems, item] })),
  removeStatusItem: (id) =>
    set((s) => ({ statusItems: s.statusItems.filter((i) => i.id !== id) }))
}))
