export interface PaneSpec {
  storageKey: string
  defaultValue: number
  min: number
  max: number
}

export const LEFT_PANE: PaneSpec = {
  storageKey: 'margin.layout.leftPaneWidth',
  defaultValue: 262,
  min: 180,
  max: 420
}

export const RIGHT_PANE: PaneSpec = {
  storageKey: 'margin.layout.rightPaneWidth',
  defaultValue: 280,
  min: 220,
  max: 520
}

const LAYOUT_STORAGE_VERSION_KEY = 'margin.layout.version'
const LAYOUT_STORAGE_VERSION = 'lettera-ui-v2'

function ensureLayoutStorageVersion(): void {
  try {
    if (localStorage.getItem(LAYOUT_STORAGE_VERSION_KEY) === LAYOUT_STORAGE_VERSION) return
    localStorage.removeItem(LEFT_PANE.storageKey)
    localStorage.removeItem(RIGHT_PANE.storageKey)
    localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION)
  } catch {
    // Layout persistence is best-effort.
  }
}

export function clampPaneWidth(spec: PaneSpec, value: number, viewportWidth = window.innerWidth): number {
  const viewportMax = Math.max(spec.min, Math.min(spec.max, viewportWidth - 360))
  return Math.min(Math.max(Math.round(value), spec.min), viewportMax)
}

export function loadPaneWidth(spec: PaneSpec): number {
  ensureLayoutStorageVersion()
  try {
    const raw = localStorage.getItem(spec.storageKey)
    const value = raw == null ? NaN : Number(raw)
    if (!Number.isFinite(value)) return spec.defaultValue
    return clampPaneWidth(spec, value)
  } catch {
    return spec.defaultValue
  }
}

export function persistPaneWidth(spec: PaneSpec, value: number): number {
  ensureLayoutStorageVersion()
  const clamped = clampPaneWidth(spec, value)
  try {
    localStorage.setItem(spec.storageKey, String(clamped))
  } catch {
    // Layout persistence is best-effort.
  }
  return clamped
}
