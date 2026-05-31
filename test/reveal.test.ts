import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { rangeRevealed } from '@/editor/livePreview/reveal'

function stateWith(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({ doc, selection: { anchor, head } })
}

describe('rangeRevealed', () => {
  // doc: "# Title\n\nbody" — line 1 is the heading (offsets 0-7)
  const doc = '# Title\n\nbody'

  it('reveals a range when the cursor is on the same line', () => {
    const state = stateWith(doc, 3) // cursor inside "# Title"
    expect(rangeRevealed(state, 0, 1)).toBe(true) // the "#" marker
  })

  it('hides a range when the cursor is on a different line', () => {
    const state = stateWith(doc, 10) // cursor inside "body"
    expect(rangeRevealed(state, 0, 1)).toBe(false)
  })

  it('reveals when a selection spans into the range\'s line', () => {
    const state = stateWith(doc, 10, 2) // selection from "body" back into heading line
    expect(rangeRevealed(state, 0, 1)).toBe(true)
  })

  it('reveals a multi-line block when the cursor is on any of its lines', () => {
    // treat [0, 12] as a block spanning all lines; cursor in "body"
    const state = stateWith(doc, 10)
    expect(rangeRevealed(state, 0, doc.length)).toBe(true)
  })
})
