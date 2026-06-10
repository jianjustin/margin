// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { Editor } from '@/components/Editor'

afterEach(cleanup)

// jsdom doesn't implement scrollIntoView, which SlashMenu calls in an effect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

describe('slash menu', () => {
  it('opens when typing "/" at the start of an empty line', async () => {
    // jsdom has no layout, so coordsAtPos returns null in the real path.
    // Stub it so the menu-positioning branch can run.
    const spy = vi
      .spyOn(EditorView.prototype, 'coordsAtPos')
      .mockReturnValue({ left: 10, right: 12, top: 20, bottom: 36 })

    const { container } = render(
      <Editor docKey="x" initialValue="" onChange={() => {}} onSave={() => {}} />
    )

    const content = container.querySelector('.cm-content') as HTMLElement
    expect(content).toBeTruthy()
    content.focus()

    fireEvent.keyDown(content, { key: '/' })

    await waitFor(() => {
      expect(document.querySelector('.slash-menu')).not.toBeNull()
    })

    spy.mockRestore()
  })
})
