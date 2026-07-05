import { describe, it, expect } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { rangeRevealed, markerRevealed } from '@/editor/livePreview/reveal'

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

describe('markerRevealed', () => {
  const doc = '- [ ] buy milk'
  // marker "[ ]" 在偏移 2..5
  it('光标在 marker 内 → true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(3) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
  it('光标紧贴 marker 边缘（pad=1）→ true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(6) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
  it('光标在同一行行尾（远离 marker）→ false', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(14) })
    expect(markerRevealed(state, 2, 5)).toBe(false)
  })
  it('选区覆盖 marker → true', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.range(0, 14) })
    expect(markerRevealed(state, 2, 5)).toBe(true)
  })
})
