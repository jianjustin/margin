// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RowContextMenu } from '@/components/FileTree/RowContextMenu'
import type { TreeNode } from '../src/shared/ipc'

const node: TreeNode = { name: 'asset.pdf', path: '/v/folder/asset.pdf', type: 'file' }

afterEach(cleanup)

describe('RowContextMenu', () => {
  it('offers full-path and project-relative copy actions', () => {
    const onCopyFullPath = vi.fn()
    const onCopyRelativePath = vi.fn()

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
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '复制完整路径' }))
    fireEvent.click(screen.getByRole('button', { name: '复制项目相对路径' }))

    expect(onCopyFullPath).toHaveBeenCalledWith(node)
    expect(onCopyRelativePath).toHaveBeenCalledWith(node)
  })
})
