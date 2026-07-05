// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { CheckboxWidget } from '../src/renderer/src/editor/livePreview/widgets'

describe('CheckboxWidget toggle', () => {
  function mockView() {
    return { dispatch: vi.fn(), dom: document.createElement('div') } as any
  }

  it('unchecked → checked on mousedown', () => {
    const view = mockView()
    const w = new CheckboxWidget(false, 10, 13) // [ ] is 3 chars
    const el = w.toDOM(view)
    // New widget is a <span role="checkbox"> with class cm-task-checkbox
    expect(el.tagName.toLowerCase()).toBe('span')
    expect(el.classList.contains('cm-task-checkbox')).toBe(true)
    expect(el.getAttribute('aria-checked')).toBe('false')
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 10, to: 13, insert: '[x]' }
    })
  })

  it('checked → unchecked on mousedown', () => {
    const view = mockView()
    const w = new CheckboxWidget(true, 20, 23) // [x] is 3 chars
    const el = w.toDOM(view)
    expect(el.tagName.toLowerCase()).toBe('span')
    expect(el.classList.contains('cm-task-checkbox')).toBe(true)
    expect(el.classList.contains('cm-task-checkbox-on')).toBe(true)
    expect(el.getAttribute('aria-checked')).toBe('true')
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 20, to: 23, insert: '[ ]' }
    })
  })
})

describe('CheckboxWidget keyboard accessibility (ARIA 4.1.2)', () => {
  function mockView() {
    return { dispatch: vi.fn(), dom: document.createElement('div') } as any
  }

  function keydown(el: HTMLElement, key: string): boolean {
    return el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }

  it('is focusable and exposes name/role/state', () => {
    const el = new CheckboxWidget(false, 10, 13).toDOM(mockView())
    expect(el.getAttribute('role')).toBe('checkbox')
    expect(el.getAttribute('aria-checked')).toBe('false')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('aria-label')).toBeTruthy()
  })

  it('Space toggles unchecked → checked and is default-prevented', () => {
    const view = mockView()
    const el = new CheckboxWidget(false, 10, 13).toDOM(view)
    const notPrevented = keydown(el, ' ')
    expect(notPrevented).toBe(false)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 10, to: 13, insert: '[x]' }
    })
  })

  it('Enter toggles checked → unchecked', () => {
    const view = mockView()
    const el = new CheckboxWidget(true, 20, 23).toDOM(view)
    keydown(el, 'Enter')
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 20, to: 23, insert: '[ ]' }
    })
  })

  it('other keys do not toggle nor get swallowed', () => {
    const view = mockView()
    const el = new CheckboxWidget(false, 10, 13).toDOM(view)
    const notPrevented = keydown(el, 'a')
    expect(notPrevented).toBe(true)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('refocuses the rebuilt checkbox at the same position after keyboard toggle', async () => {
    const view = mockView()
    document.body.appendChild(view.dom)
    const w = new CheckboxWidget(false, 10, 13)
    const el = w.toDOM(view)
    // Simulate the decoration rebuild: the old DOM is replaced by a fresh
    // widget at the same document position ([ ] and [x] are both 3 chars).
    const rebuilt = new CheckboxWidget(true, 10, 13).toDOM(view)
    view.dom.appendChild(rebuilt)
    keydown(el, ' ')
    await new Promise((r) => requestAnimationFrame(r))
    expect(document.activeElement).toBe(rebuilt)
    view.dom.remove()
  })
})
