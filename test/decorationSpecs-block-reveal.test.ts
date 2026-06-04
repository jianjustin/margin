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

describe('collectDecorations — block-level reveal', () => {
  describe('fenced code', () => {
    const doc = '```js\nconst x = 1\n```\nbody'
    // offsets: 0 ``` opens, 6 const line, 18 ``` closes, 22 body

    it('reveals both fences when cursor is on a body line of the block', () => {
      // cursor inside "const x = 1" line
      const specs = collectDecorations(stateWith(doc, 10))
      const fenceHides = specs.filter((s) => s.kind === 'hide' && text(doc, s).includes('```'))
      expect(fenceHides.length).toBeGreaterThanOrEqual(2)
      for (const s of fenceHides) {
        expect(s.revealed).toBe(true)
      }
    })

    it('reveals fences when cursor is on the opening fence line', () => {
      const specs = collectDecorations(stateWith(doc, 0))
      const fenceHides = specs.filter((s) => s.kind === 'hide' && text(doc, s).includes('```'))
      for (const s of fenceHides) {
        expect(s.revealed).toBe(true)
      }
    })

    it('keeps fences hidden when cursor is outside the block', () => {
      // cursor in "body"
      const specs = collectDecorations(stateWith(doc, doc.length - 1))
      const fenceHides = specs.filter((s) => s.kind === 'hide' && text(doc, s).includes('```'))
      expect(fenceHides.length).toBeGreaterThanOrEqual(2)
      for (const s of fenceHides) {
        expect(s.revealed).toBe(false)
      }
    })
  })

  describe('blockquote', () => {
    const doc = '> line one\n> line two\n\nbody'

    it('reveals every > marker when cursor is on any line of the same blockquote', () => {
      // cursor on first quote line
      const specs = collectDecorations(stateWith(doc, 3))
      const quoteHides = specs.filter((s) => s.kind === 'hide' && text(doc, s) === '>')
      expect(quoteHides.length).toBe(2)
      for (const s of quoteHides) {
        expect(s.revealed).toBe(true)
      }
    })

    it('keeps > markers hidden when cursor is outside the blockquote', () => {
      // cursor in "body"
      const specs = collectDecorations(stateWith(doc, doc.length - 1))
      const quoteHides = specs.filter((s) => s.kind === 'hide' && text(doc, s) === '>')
      for (const s of quoteHides) {
        expect(s.revealed).toBe(false)
      }
    })
  })

  it('does not over-reveal inline backticks based on block context (they stay per-line)', () => {
    const doc = 'x `inline` y\n\nz'
    // cursor on the line with inline code
    const specs = collectDecorations(stateWith(doc, 0))
    const backtickHides = specs.filter((s) => s.kind === 'hide' && text(doc, s) === '`')
    expect(backtickHides.length).toBe(2)
    for (const s of backtickHides) {
      expect(s.revealed).toBe(true) // cursor on same line → revealed
    }

    // now cursor on "z" (different line)
    const specs2 = collectDecorations(stateWith(doc, doc.length))
    const backtickHides2 = specs2.filter((s) => s.kind === 'hide' && text(doc, s) === '`')
    for (const s of backtickHides2) {
      expect(s.revealed).toBe(false)
    }
  })
})
