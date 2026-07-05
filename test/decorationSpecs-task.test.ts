import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}
function text(doc: string, s: DecoSpec): string {
  return doc.slice(s.from, s.to)
}

// Alias matching the brief's helper name
const mkState = stateWith

describe('collectDecorations — task list', () => {
  it('emits a task spec and hides the leading "- " bullet', () => {
    const doc = '- [ ] do this\n\nbody'
    const specs = collectDecorations(stateWith(doc, 16)) // cursor in "body"
    const task = specs.find((s) => s.kind === 'task')
    expect(task).toBeTruthy()
    expect(task!.checked).toBe(false)
    // The "- " bullet before the checkbox is hidden so it renders bare.
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s) === '- ')
    expect(hide).toBeTruthy()
    expect(hide!.revealed).toBe(false)
  })

  it('marks a checked task — hide spec revealed only when cursor touches the marker', () => {
    const doc = '- [x] done'
    // cursor at position 8 (in "done") — far from marker, NOT revealed
    const specsAway = collectDecorations(stateWith(doc, 8))
    const taskAway = specsAway.find((s) => s.kind === 'task')
    expect(taskAway!.checked).toBe(true)
    // hide for "- " should NOT be revealed (cursor is not near marker)
    const hideAway = specsAway.find((s) => s.kind === 'hide' && text(doc, s) === '- ')
    expect(hideAway!.revealed).toBe(false)
  })

  // New marker-level reveal behavior (Task 1.3)
  it('cursor far from marker → task spec not revealed', () => {
    const state = mkState('- [ ] buy milk', 14)
    const task = collectDecorations(state).find((s) => s.kind === 'task')
    expect(task?.revealed).toBe(false)
  })

  it('cursor inside marker → task spec revealed', () => {
    const state = mkState('- [ ] buy milk', 3)
    const task = collectDecorations(state).find((s) => s.kind === 'task')
    expect(task?.revealed).toBe(true)
  })

  it('completed task emits taskDoneText spec for the body text', () => {
    const state = mkState('- [x] done item', 0)
    const specs = collectDecorations(state)
    const done = specs.find((s) => s.kind === 'taskDoneText')
    expect(done).toBeTruthy()
    expect(done!.from).toBe(6) // after "[x]" (pos 2..4) + space = pos 6
  })

  it('taskDoneText stays concealed (revealed: false) with cursor far from marker', () => {
    const state = mkState('- [x] done item', 14)
    const done = collectDecorations(state).find((s) => s.kind === 'taskDoneText')
    expect(done).toBeTruthy()
    expect(done!.revealed).toBe(false)
  })

  it('taskDoneText flips to revealed: true when cursor is on the marker', () => {
    const state = mkState('- [x] done item', 3)
    const done = collectDecorations(state).find((s) => s.kind === 'taskDoneText')
    expect(done).toBeTruthy()
    expect(done!.revealed).toBe(true)
  })
})
