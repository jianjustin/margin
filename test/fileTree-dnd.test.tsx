// @vitest-environment jsdom
/**
 * DnD 测试策略说明：
 *
 * jsdom 没有内置 DragEvent（DragEvent is not defined in jsdom v20），且
 * DragEvent.dataTransfer 在浏览器安全模型中于 dragover 期间只暴露 types 不暴露值。
 *
 * 方案选择：
 * 1. 对 drop/dragover/dragstart — 使用 testing-library 的 `fireEvent.drop` 等，
 *    配合 `Object.defineProperty` 在事件对象上注入 mock dataTransfer。
 *    fireEvent 内部用 HTMLElement.dispatchEvent，不依赖 DragEvent 全局类。
 * 2. 对 canMoveInto guard 逻辑 — 直接单元测试纯函数（最稳定）。
 * 3. 对 `inner.md` 测试 — beforeEach 设置 folderA 展开以便看到子节点。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { FileTree } from '@/components/FileTree/FileTree'
import { useVaultStore } from '@/stores/vaultStore'
import { canMoveInto, dirname } from '@/vault-core'
import type { TreeNode } from '../src/shared/ipc'

// ── Tree fixture ────────────────────────────────────────────────────────────

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [
      { name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' },
      {
        name: 'subFolder',
        path: '/v/folderA/subFolder',
        type: 'folder',
        children: []
      }
    ]
  },
  { name: 'folderB', path: '/v/folderB', type: 'folder', children: [] },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

// ── DataTransfer mock factory ────────────────────────────────────────────────

function makeMockDataTransfer(initialData: Record<string, string> = {}): DataTransfer {
  const store: Record<string, string> = { ...initialData }
  const types: string[] = Object.keys(initialData)

  return {
    types,
    effectAllowed: 'none' as DataTransfer['effectAllowed'],
    dropEffect: 'none' as DataTransfer['dropEffect'],
    getData(format: string): string {
      return store[format] ?? ''
    },
    setData(format: string, data: string): void {
      store[format] = data
      if (!types.includes(format)) types.push(format)
    },
    clearData(): void {
      Object.keys(store).forEach((k) => delete store[k])
      types.length = 0
    },
    items: {} as DataTransferItemList,
    files: {} as FileList,
    setDragImage: vi.fn()
  } as unknown as DataTransfer
}

/**
 * Fires a drag event using testing-library's fireEvent and injects a mock
 * dataTransfer. jsdom does not define DragEvent globally, so we use
 * fireEvent[eventType] which dispatches a MouseEvent internally and then
 * monkey-patches the dataTransfer via Object.defineProperty on the event.
 *
 * We create a standard Event and inject dt before dispatch.
 */
function fireDragWithTransfer(
  element: Element,
  eventType: 'dragstart' | 'dragover' | 'dragleave' | 'drop',
  dt: DataTransfer
): void {
  const event = new Event(eventType, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dt, configurable: true })
  element.dispatchEvent(event)
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // folderA is expanded (full path) so inner.md and subFolder are visible
  useVaultStore.setState({ root: '/v', tree, expanded: new Set(['/v/folderA']), selectedPath: null })
})
afterEach(cleanup)

// ── Pure-function guard tests (no DOM needed) ────────────────────────────────

describe('canMoveInto guard (pure)', () => {
  it('allows moving a file into a different folder', () => {
    expect(canMoveInto('/v/root.md', '/v/folderA')).toBe(true)
  })

  it('allows moving a folder into a sibling folder', () => {
    expect(canMoveInto('/v/folderA', '/v/folderB')).toBe(true)
  })

  it('rejects moving a node into its current parent (no-op)', () => {
    // root.md is already in /v
    expect(canMoveInto('/v/root.md', '/v')).toBe(false)
  })

  it('rejects moving a folder into itself', () => {
    expect(canMoveInto('/v/folderA', '/v/folderA')).toBe(false)
  })

  it('rejects moving a folder into its own descendant', () => {
    expect(canMoveInto('/v/folderA', '/v/folderA/subFolder')).toBe(false)
  })
})

describe('dirname helper (pure)', () => {
  it('returns parent directory of a file', () => {
    expect(dirname('/v/folderA/inner.md')).toBe('/v/folderA')
  })

  it('returns parent directory of a folder', () => {
    expect(dirname('/v/folderA')).toBe('/v')
  })
})

// ── DOM drag event tests ──────────────────────────────────────────────────────

describe('FileTree drag-and-drop (DOM)', () => {
  it('dragStart sets application/x-margin-path on dataTransfer', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const row = screen.getByText('root.md').closest('div[draggable]')!
    const dt = makeMockDataTransfer()
    fireDragWithTransfer(row, 'dragstart', dt)

    expect(dt.getData('application/x-margin-path')).toBe('/v/root.md')
  })

  it('drop onto a folder row calls onMove(src, folderPath)', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const folderBRow = screen.getByText('folderB').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/root.md' })
    fireDragWithTransfer(folderBRow, 'drop', dt)

    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith('/v/root.md', '/v/folderB')
  })

  it('drop onto a file row calls onMove(src, dirname(filePath))', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    // inner.md is inside /v/folderA — drop onto it should target /v/folderA
    const innerRow = screen.getByText('inner.md').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/root.md' })
    fireDragWithTransfer(innerRow, 'drop', dt)

    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith('/v/root.md', '/v/folderA')
  })

  it('drop that violates canMoveInto (self) does NOT call onMove', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const folderARow = screen.getByText('folderA').closest('div[draggable]')!
    // Dragging folderA onto itself
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/folderA' })
    fireDragWithTransfer(folderARow, 'drop', dt)

    expect(onMove).not.toHaveBeenCalled()
  })

  it('drop that violates canMoveInto (descendant) does NOT call onMove', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    // Dragging folderA into its own child subFolder
    const subFolderRow = screen.getByText('subFolder').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/folderA' })
    fireDragWithTransfer(subFolderRow, 'drop', dt)

    expect(onMove).not.toHaveBeenCalled()
  })

  it('drop with empty dataTransfer does NOT call onMove', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const folderBRow = screen.getByText('folderB').closest('div[draggable]')!
    const dt = makeMockDataTransfer() // no path set
    fireDragWithTransfer(folderBRow, 'drop', dt)

    expect(onMove).not.toHaveBeenCalled()
  })

  it('dragOver on a folder with our mime type calls preventDefault', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const folderBRow = screen.getByText('folderB').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/root.md' })
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: dt, configurable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    folderBRow.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('dragOver without our mime type does NOT call preventDefault', () => {
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    const folderBRow = screen.getByText('folderB').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'text/plain': 'something else' })
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: dt, configurable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    folderBRow.dispatchEvent(event)

    expect(preventDefaultSpy).not.toHaveBeenCalled()
  })

  it('drop of nested file onto sibling folder calls onMove exactly once with correct dest (regression: no root-level double-move)', () => {
    // Regression test for drop event bubbling bug:
    // Before fix: drop on FileTreeRow bubbled up to the root container's handleRootDrop,
    // causing onMove to be called twice — once with the correct destDir (/v/folderB),
    // and once with the vault root (/v). The fix (stopPropagation in handleDrop) ensures
    // only one call happens with the correct target.
    //
    // This test uses a nested source file (/v/folderA/inner.md) because the old bug was
    // masked when the source was a root-level file: canMoveInto('/v/root.md', '/v') = false
    // (already in root), so the double-call was silently short-circuited.
    const onMove = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={onMove} />)

    // inner.md is visible because folderA is expanded in beforeEach
    const innerRow = screen.getByText('inner.md').closest('div[draggable]')!
    // We drop inner.md onto folderB
    const folderBRow = screen.getByText('folderB').closest('div[draggable]')!
    const dt = makeMockDataTransfer({ 'application/x-margin-path': '/v/folderA/inner.md' })
    fireDragWithTransfer(folderBRow, 'drop', dt)

    // Must be called exactly once — not twice (the bubbling bug would call it again
    // with vault root as destDir since canMoveInto('/v/folderA/inner.md', '/v') = true)
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith('/v/folderA/inner.md', '/v/folderB')
    // Explicitly assert the wrong call never happened
    expect(onMove).not.toHaveBeenCalledWith('/v/folderA/inner.md', '/v')

    // innerRow itself is not used in this drop, but we ensure the fixture is correct
    expect(innerRow).toBeTruthy()
  })
})

// ── Ensure click behavior is unaffected ──────────────────────────────────────

describe('FileTree click behavior unaffected by draggable', () => {
  it('clicking a file row still calls onOpenFile', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} onMove={() => {}} />)
    fireEvent.click(screen.getByText('root.md'))
    expect(onOpenFile).toHaveBeenCalledOnce()
  })

  it('clicking a folder row still toggles expansion', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} onMove={() => {}} />)
    // Reset — folderB is collapsed
    useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
    fireEvent.click(screen.getByText('folderB'))
    expect(useVaultStore.getState().expanded.has('/v/folderB')).toBe(true)
  })
})
