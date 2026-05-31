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

describe('collectDecorations — blocks', () => {
  it('styles a blockquote line and hides the > marker', () => {
    const doc = '> quoted\n\nbody'
    const specs = collectDecorations(stateWith(doc, 11)) // cursor in "body"
    expect(specs.some((s) => s.kind === 'quoteLine')).toBe(true)
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).includes('>'))
    expect(hide).toBeTruthy()
    expect(hide!.revealed).toBe(false)
  })

  it('styles every line of a fenced code block and hides the fences', () => {
    const doc = '```js\nconst x = 1\n```\n\nbody'
    const specs = collectDecorations(stateWith(doc, doc.length - 1)) // cursor in "body"
    const codeLines = specs.filter((s) => s.kind === 'codeLine')
    expect(codeLines.length).toBeGreaterThanOrEqual(3) // fence, code, fence
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s).includes('```'))).toBe(true)
  })

  it('replaces a horizontal rule with a gated hr spec', () => {
    const doc = 'a\n\n---\n\nb'
    const specs = collectDecorations(stateWith(doc, 0)) // cursor on line "a"
    const hr = specs.find((s) => s.kind === 'hr')
    expect(hr).toBeTruthy()
    expect(hr!.revealed).toBe(false)
    expect(text(doc, hr!)).toBe('---')
  })

  it('emits a task spec with checked state', () => {
    const doc = '- [x] done\n- [ ] todo'
    const specs = collectDecorations(stateWith(doc, doc.length)) // cursor on "todo" line
    const checked = specs.find((s) => s.kind === 'task' && s.checked === true)
    const unchecked = specs.find((s) => s.kind === 'task' && s.checked === false)
    expect(checked).toBeTruthy()
    expect(unchecked).toBeTruthy()
    // cursor is on the second line, so the first task is hidden (revealed=false)
    expect(checked!.revealed).toBe(false)
  })

  it('styles a link and hides its [] and (url) but leaves the label', () => {
    const doc = 'see [docs](http://x.io) here'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'link')).toBe(true)
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s) === '[')).toBe(true)
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s) === ']')).toBe(true)
    expect(specs.some((s) => s.kind === 'hide' && text(doc, s).includes('http://x.io'))).toBe(true)
  })
})
