// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { CheckboxWidget } from '../src/renderer/src/editor/livePreview/widgets'

describe('CheckboxWidget toggle', () => {
  function mockView() {
    return { dispatch: vi.fn() } as any
  }

  it('unchecked → checked on mousedown', () => {
    const view = mockView()
    const w = new CheckboxWidget(false, 10, 13) // [ ] is 3 chars
    const el = w.toDOM(view) as HTMLInputElement
    expect(el.checked).toBe(false)
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 10, to: 13, insert: '[x]' }
    })
  })

  it('checked → unchecked on mousedown', () => {
    const view = mockView()
    const w = new CheckboxWidget(true, 20, 23) // [x] is 3 chars
    const el = w.toDOM(view) as HTMLInputElement
    expect(el.checked).toBe(true)
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 20, to: 23, insert: '[ ]' }
    })
  })
})
