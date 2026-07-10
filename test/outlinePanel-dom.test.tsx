// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlinePanel } from '@/plugin-api/builtins/OutlinePanel'
import { useDocumentStore } from '@/stores/documentStore'

afterEach(() => {
  cleanup()
  useDocumentStore.getState().reset()
})

function seed(content: string): void {
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/a.md', content)
}

describe('OutlinePanel', () => {
  it('shows the empty state with no headings', () => {
    seed('just text, no headings')
    render(<OutlinePanel />)
    expect(screen.getByText('Table of Contents')).toBeTruthy()
    expect(screen.getByText('暂无标题')).toBeTruthy()
  })

  it('lists headings and calls onJumpToLine on click', () => {
    seed('# Title\n\ntext\n\n## Sub\n\nmore text')
    const onJumpToLine = vi.fn()
    render(<OutlinePanel onJumpToLine={onJumpToLine} />)

    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Sub')).toBeTruthy()

    fireEvent.click(screen.getByText('Sub'))
    expect(onJumpToLine).toHaveBeenCalledWith(4)
  })
})
