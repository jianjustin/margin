import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

describe('collectDecorations — eachLine line boundaries', () => {
  it('does NOT decorate the line after a blockquote', () => {
    const doc = '> a\n> b\n\nnext'
    const specs = collectDecorations(stateWith(doc, doc.length)) // cursor on "next"
    const quoteLines = specs.filter((s) => s.kind === 'quoteLine')
    expect(quoteLines.length).toBe(2) // exactly the two "> " lines
    const nextLineFrom = doc.indexOf('next')
    expect(quoteLines.some((s) => s.from === nextLineFrom)).toBe(false)
  })

  it('decorates exactly the fenced-code lines, not the following paragraph', () => {
    const doc = '```js\nconst x = 1\n```\nbody'
    const specs = collectDecorations(stateWith(doc, 0)) // cursor on the opening fence
    const codeLines = specs.filter((s) => s.kind === 'codeLine')
    expect(codeLines.length).toBe(3) // fence, code, fence
    const bodyFrom = doc.indexOf('body')
    expect(codeLines.some((s) => s.from === bodyFrom)).toBe(false)
  })
})
