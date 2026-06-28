// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlineDrawer } from '@/components/OutlineDrawer'
import { useDocumentStore } from '@/stores/documentStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: '日程',
    path: '/v/日程',
    type: 'folder',
    children: [
      { name: '2026-06-28.md', path: '/v/日程/2026-06-28.md', type: 'file' },
      { name: '2026-06-30.md', path: '/v/日程/2026-06-30.md', type: 'file' }
    ]
  }
]

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
})

function seed(content: string): void {
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/日程/2026-06-28.md', content)
}

describe('OutlineDrawer Schedule tab', () => {
  it('renders a month calendar and marks dates that have schedule notes', () => {
    seed(`---
type: 日程
date: 2026-06-28
---

# 2026-06-28 日程

## 今日待办
- [ ] Review launch plan

## 记录
Met with product team.
`)
    const onOpenSchedule = vi.fn()
    render(
      <OutlineDrawer
        width={280}
        tree={tree}
        scheduleDir="日程"
        onOpenSchedule={onOpenSchedule}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))

    expect(screen.getByText('2026 年 6 月')).toBeTruthy()
    const dayWithNote = screen.getByRole('button', { name: '2026-06-30' })
    expect(dayWithNote.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByText('Review launch plan')).toBeNull()
    expect(screen.queryByText('Met with product team.')).toBeNull()

    fireEvent.click(dayWithNote)
    expect(onOpenSchedule).toHaveBeenCalledOnce()
    expect(onOpenSchedule.mock.calls[0][0]).toEqual(new Date(2026, 5, 30))
  })

  it('can navigate to another month', () => {
    seed(`---
type: 日程
date: 2026-06-28
---
`)
    render(<OutlineDrawer width={280} tree={tree} scheduleDir="日程" />)

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))

    expect(screen.getByText('2026 年 7 月')).toBeTruthy()
  })
})
