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
    const cells = Array.from(el.querySelectorAll('th, td:not(.cm-table-row-del-cell)')) as HTMLElement[]
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

  it('renders row delete as an overlaid trash button in the last data cell', () => {
    const view = mockView()
    const w = new TableWidget(TABLE_SRC, 0, TABLE_SRC.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)

    expect(el.querySelector('.cm-table-row-del-cell')).toBeNull()
    const dataRow = el.querySelector('tbody tr') as HTMLTableRowElement
    const cells = Array.from(dataRow.cells)
    expect(cells).toHaveLength(2)
    const lastCell = cells[1]
    expect(lastCell.classList.contains('cm-table-last-cell')).toBe(true)
    const del = lastCell.querySelector('.cm-table-row-del') as HTMLButtonElement
    expect(del).not.toBeNull()
    expect(del.textContent).not.toBe('×')
    expect(del.querySelector('svg')).not.toBeNull()

    del.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.dispatch).toHaveBeenCalled()
    expect(view.dispatch.mock.calls[0][0].changes.insert).not.toContain('| c | d |')

    document.body.removeChild(el)
  })

  it('dispatches a wiki-link event from table cell rendered markdown', () => {
    const view = mockView()
    const src = '| A | B |\n| --- | --- |\n| [[Target Note]] | d |'
    const w = new TableWidget(src, 0, src.length)
    const el = w.toDOM(view)
    document.body.appendChild(el)

    const opened: string[] = []
    el.addEventListener('margin-open-link', (event) => {
      opened.push((event as CustomEvent<string>).detail)
    })
    const link = el.querySelector('.cm-wiki-link') as HTMLElement
    expect(link).not.toBeNull()
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(opened).toEqual(['wiki:Target Note'])

    document.body.removeChild(el)
  })
})
