// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DocumentTabs } from '@/components/DocumentTabs'
import { useDocumentStore } from '@/stores/documentStore'

beforeEach(() => {
  useDocumentStore.getState().reset()
})

afterEach(cleanup)

describe('DocumentTabs', () => {
  it('renders one tab per open document and marks the active tab', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.openOrActivate('/v/b.md', 'b')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    expect(screen.getByRole('tab', { name: /a.md/ }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: /b.md/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('calls onActivate when a tab is clicked', () => {
    const onActivate = vi.fn()
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.openOrActivate('/v/b.md', 'b')
    render(<DocumentTabs onActivate={onActivate} onClose={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('tab', { name: /a.md/ }))
    expect(onActivate).toHaveBeenCalledWith('/v/a.md')
  })

  it('shows a dirty indicator for dirty tabs', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/a.md', 'a')
    store.setActiveContent('edited')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    expect(screen.getByLabelText('a.md 有未保存更改')).toBeTruthy()
  })

  it('uses the file name for Windows-style paths and dirty labels', () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('C:\\vault\\a.md', 'a')
    store.setActiveContent('edited')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    expect(screen.getByRole('tab', { name: /a.md/ })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /C:\\vault\\a.md/ })).toBeNull()
    expect(screen.getByLabelText('a.md 有未保存更改')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked without activating the tab button', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn(() => Promise.resolve())
    useDocumentStore.getState().openOrActivate('/v/a.md', 'a')
    render(<DocumentTabs onActivate={onActivate} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md' }))
    expect(onClose).toHaveBeenCalledWith('/v/a.md')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('renders the close control as a native button outside the tab button', () => {
    useDocumentStore.getState().openOrActivate('/v/a.md', 'a')
    render(<DocumentTabs onActivate={() => {}} onClose={() => Promise.resolve()} />)
    const closeButton = screen.getByRole('button', { name: '关闭 a.md' })
    expect(closeButton.tagName).toBe('BUTTON')
    expect(closeButton.closest('[role="tab"]')).toBeNull()
  })

  it.each(['Enter', ' '])('calls onClose with %s on the close button without activating the tab', (key) => {
    const onActivate = vi.fn()
    const onClose = vi.fn(() => Promise.resolve())
    useDocumentStore.getState().openOrActivate('/v/a.md', 'a')
    render(<DocumentTabs onActivate={onActivate} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '关闭 a.md' }), { key })
    expect(onClose).toHaveBeenCalledWith('/v/a.md')
    expect(onActivate).not.toHaveBeenCalled()
  })
})
