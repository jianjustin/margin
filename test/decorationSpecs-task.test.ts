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

  it('marks a checked task and reveals the bullet when the cursor is on the line', () => {
    const doc = '- [x] done'
    const specs = collectDecorations(stateWith(doc, 8)) // cursor on the task line
    const task = specs.find((s) => s.kind === 'task')
    expect(task!.checked).toBe(true)
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s) === '- ')
    expect(hide!.revealed).toBe(true)
  })
})
