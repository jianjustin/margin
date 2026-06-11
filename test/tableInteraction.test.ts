// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { TableWidget } from '../src/renderer/src/editor/livePreview/widgets'

// Simple 2-col, 1-row table
const TABLE_SRC = '| a | b |\n| --- | --- |\n| c | d |'

describe('TableWidget interaction', () => {
  function mockView() {
    return { dispatch: vi.fn() } as any
  }

  it('Tab moves focus to next cell', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)
    const cells = Array.from(el.querySelectorAll('th, td')) as HTMLElement[]
    const spy = vi.spyOn(cells[1], 'focus')
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(spy).toHaveBeenCalled()
    document.body.removeChild(el)
  })

  it('Shift+Tab moves focus to previous cell', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)
    const cells = Array.from(el.querySelectorAll('th, td')) as HTMLElement[]
    const spy = vi.spyOn(cells[0], 'focus')
    cells[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )
    expect(spy).toHaveBeenCalled()
    document.body.removeChild(el)
  })

  it('Tab from last cell dispatches row append', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)
    const cells = Array.from(el.querySelectorAll('th, td')) as HTMLElement[]
    const last = cells[cells.length - 1]
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(view.dispatch).toHaveBeenCalled()
    const change = view.dispatch.mock.calls[0][0].changes
    expect(change.insert).toContain('|  |  |') // new empty row
    document.body.removeChild(el)
  })

  it('Shift+Tab on first cell does not crash or navigate', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)
    const cells = Array.from(el.querySelectorAll('th, td')) as HTMLElement[]
    // Should not throw, and dispatch should not be called
    cells[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )
    expect(view.dispatch).not.toHaveBeenCalled()
    document.body.removeChild(el)
  })

  it('toolbar add-row button dispatches new row', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)
    const addRowBtn = el.querySelector('.cm-table-toolbar button') as HTMLButtonElement
    expect(addRowBtn.textContent).toBe('+ 行')
    addRowBtn.click()
    expect(view.dispatch).toHaveBeenCalled()
    const change = view.dispatch.mock.calls[0][0].changes
    expect(change.insert).toContain('|  |  |') // new empty row appended
    document.body.removeChild(el)
  })
})
