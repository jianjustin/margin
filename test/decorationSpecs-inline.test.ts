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

describe('collectDecorations — inline', () => {
  it('emits a heading line deco with the right level and hides the marker', () => {
    const doc = '# Title\n\nbody'
    const specs = collectDecorations(stateWith(doc, 10)) // cursor in "body"
    expect(specs.some((s) => s.kind === 'headingLine' && s.level === 1)).toBe(true)
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).startsWith('#'))
    expect(hide).toBeTruthy()
    expect(hide!.revealed).toBe(false)
    // the hidden marker also swallows the trailing space after '#'
    expect(text(doc, hide!)).toBe('# ')
  })

  it('reveals the heading marker when the cursor is on the heading line', () => {
    const doc = '# Title\n\nbody'
    const specs = collectDecorations(stateWith(doc, 3)) // cursor in "# Title"
    const hide = specs.find((s) => s.kind === 'hide' && text(doc, s).startsWith('#'))
    expect(hide!.revealed).toBe(true)
  })

  it('styles bold and hides its ** markers', () => {
    const doc = 'a **bold** b'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'bold')).toBe(true)
    const hides = specs.filter((s) => s.kind === 'hide' && text(doc, s) === '**')
    expect(hides.length).toBe(2)
  })

  it('styles italic and strikethrough', () => {
    const doc = 'x *i* y ~~s~~ z'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'italic')).toBe(true)
    expect(specs.some((s) => s.kind === 'strike')).toBe(true)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '*').length).toBe(2)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '~~').length).toBe(2)
  })

  it('styles inline code and hides its backticks', () => {
    const doc = 'call `fn()` now'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s) => s.kind === 'inlineCode')).toBe(true)
    expect(specs.filter((s) => s.kind === 'hide' && text(doc, s) === '`').length).toBe(2)
  })
})
