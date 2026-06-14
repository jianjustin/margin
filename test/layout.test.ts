// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampPaneWidth,
  loadPaneWidth,
  persistPaneWidth,
  LEFT_PANE,
  RIGHT_PANE
} from '@/lib/layout'

describe('layout pane widths', () => {
  beforeEach(() => localStorage.clear())

  it('clamps widths to pane bounds', () => {
    expect(clampPaneWidth(LEFT_PANE, 20)).toBe(LEFT_PANE.min)
    expect(clampPaneWidth(LEFT_PANE, 9999)).toBe(LEFT_PANE.max)
    expect(clampPaneWidth(RIGHT_PANE, 20)).toBe(RIGHT_PANE.min)
    expect(clampPaneWidth(RIGHT_PANE, 9999)).toBe(RIGHT_PANE.max)
  })

  it('loads defaults for missing or invalid storage values', () => {
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.defaultValue)
    localStorage.setItem(LEFT_PANE.storageKey, 'nope')
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.defaultValue)
  })

  it('persists clamped widths', () => {
    persistPaneWidth(LEFT_PANE, 9999)
    expect(loadPaneWidth(LEFT_PANE)).toBe(LEFT_PANE.max)
  })
})
