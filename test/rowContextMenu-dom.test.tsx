// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RowContextMenu } from '@/components/FileTree/RowContextMenu'
import type { TreeNode } from '../src/shared/ipc'

const node: TreeNode = { name: 'asset.pdf', path: '/v/folder/asset.pdf', type: 'file' }

afterEach(cleanup)

describe('RowContextMenu', () => {
  it('offers full-path and project-relative copy actions', () => {
    const onCopyFullPath = vi.fn()
    const onCopyRelativePath = vi.fn()
    const onOpenInFinder = vi.fn()

    render(
      <RowContextMenu
        menu={{ node, x: 10, y: 20 }}
        onClose={() => {}}
        onNewNote={() => {}}
        onNewFolder={() => {}}
        onRename={() => {}}
        onMove={() => {}}
        onTrash={() => {}}
        onCopyFullPath={onCopyFullPath}
        onCopyRelativePath={onCopyRelativePath}
        onOpenInFinder={onOpenInFinder}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '复制完整路径' }))
    fireEvent.click(screen.getByRole('button', { name: '复制项目相对路径' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Finder 中显示' }))

    expect(onCopyFullPath).toHaveBeenCalledWith(node)
    expect(onCopyRelativePath).toHaveBeenCalledWith(node)
    expect(onOpenInFinder).toHaveBeenCalledWith(node)
  })

  it('菜单内右键不触发 onClose', async () => {
    const onClose = vi.fn()
    render(
      <RowContextMenu
        menu={{ node, x: 10, y: 20 }}
        onClose={onClose}
        onNewNote={() => {}}
        onNewFolder={() => {}}
        onRename={() => {}}
        onMove={() => {}}
        onTrash={() => {}}
        onCopyFullPath={() => {}}
        onCopyRelativePath={() => {}}
        onOpenInFinder={() => {}}
      />
    )

    // 等待 rAF 注册 contextmenu 监听器
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    // 在菜单按钮上触发 contextmenu 事件
    const btn = screen.getByRole('button', { name: '重命名…' })
    fireEvent.contextMenu(btn)

    // 因为是菜单内部，onClose 不应被调用
    expect(onClose).not.toHaveBeenCalled()
  })
})
