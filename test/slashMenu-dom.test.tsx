// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { Editor } from '@/components/Editor'

afterEach(cleanup)

// jsdom doesn't implement scrollIntoView, which SlashMenu calls in an effect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

function mountedView(container: HTMLElement): EditorView {
  const content = container.querySelector('.cm-content') as HTMLElement
  expect(content).toBeTruthy()
  const view = EditorView.findFromDOM(content)
  expect(view).toBeTruthy()
  return view as EditorView
}

describe('slash menu', () => {
  it('opens when "/" is typed at the start of an empty line', async () => {
    const spy = vi
      .spyOn(EditorView.prototype, 'coordsAtPos')
      .mockReturnValue({ left: 10, right: 12, top: 20, bottom: 36 })
    const { container } = render(
      <Editor docKey="x" initialValue="" onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({ changes: { from: 0, insert: '/' }, userEvent: 'input.type' })
    await waitFor(() => {
      expect(document.querySelector('.slash-menu')).not.toBeNull()
    })
    spy.mockRestore()
  })

  it('opens for an IME-composed "/" (input.type.compose)', async () => {
    const spy = vi
      .spyOn(EditorView.prototype, 'coordsAtPos')
      .mockReturnValue({ left: 10, right: 12, top: 20, bottom: 36 })
    const { container } = render(
      <Editor docKey="x" initialValue="你好 " onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({
      changes: { from: 3, insert: '/' },
      selection: { anchor: 4 },
      userEvent: 'input.type.compose'
    })
    await waitFor(() => {
      expect(document.querySelector('.slash-menu')).not.toBeNull()
    })
    spy.mockRestore()
  })

  it('does not open for the second slash of "http://"', async () => {
    const { container } = render(
      <Editor docKey="x" initialValue="http:/" onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({
      changes: { from: 6, insert: '/' },
      selection: { anchor: 7 },
      userEvent: 'input.type'
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelector('.slash-menu')).toBeNull()
  })
})
