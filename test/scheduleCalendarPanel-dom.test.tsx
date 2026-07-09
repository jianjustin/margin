// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScheduleCalendarPanel } from '@/plugin-api/builtins/ScheduleCalendarPanel'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { useSettingsStore } from '@/stores/settingsStore'
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
  useVaultStore.getState().setTree([])
  useSettingsStore.setState({ scheduleDir: '日程' })
})

function seed(content: string): void {
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/日程/2026-06-28.md', content)
  useVaultStore.getState().setTree(tree)
  useSettingsStore.setState({ scheduleDir: '日程' })
}

describe('ScheduleCalendarPanel', () => {
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
    render(<ScheduleCalendarPanel onOpenSchedule={onOpenSchedule} />)

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
    render(<ScheduleCalendarPanel />)

    fireEvent.click(screen.getByRole('button', { name: '下个月' }))

    expect(screen.getByText('2026 年 7 月')).toBeTruthy()
  })
})
