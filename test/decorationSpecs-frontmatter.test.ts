import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  collectDecorations,
  frontmatterEnd,
  type DecoSpec
} from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

const FM_DOC = ['---', 'title: X', 'tags: a, b', '---', '', '# Real Heading', '', 'body'].join(
  '\n'
)

describe('frontmatterEnd', () => {
  it('returns the end offset of a closed frontmatter block', () => {
    const state = stateWith(FM_DOC, 0)
    // closing '---' is line 4; its end is the offset of the second '---'
    const expected = FM_DOC.indexOf('---', 1) + 3
    expect(frontmatterEnd(state)).toBe(expected)
  })

  it('returns 0 when the document does not start with ---', () => {
    expect(frontmatterEnd(stateWith('# Title\n\nbody', 0))).toBe(0)
  })

  it('returns 0 when there is no closing fence', () => {
    expect(frontmatterEnd(stateWith('---\ntitle: X\n\nbody', 0))).toBe(0)
  })
})

describe('collectDecorations — frontmatter', () => {
  it('styles every frontmatter line as frontmatter, not as a heading', () => {
    const specs = collectDecorations(stateWith(FM_DOC, FM_DOC.length)) // cursor in body
    const fm = specs.filter((s: DecoSpec) => s.kind === 'frontmatter')
    expect(fm.length).toBe(4) // ---, title, tags, ---
  })

  it('emits no hr or heading decorations inside the frontmatter region', () => {
    const specs = collectDecorations(stateWith(FM_DOC, FM_DOC.length))
    const fmEnd = frontmatterEnd(stateWith(FM_DOC, 0))
    const bogus = specs.filter(
      (s: DecoSpec) => (s.kind === 'hr' || s.kind === 'headingLine') && s.from < fmEnd
    )
    expect(bogus.length).toBe(0)
  })

  it('still renders the real heading after the frontmatter', () => {
    const specs = collectDecorations(stateWith(FM_DOC, FM_DOC.length))
    const realHeadingFrom = FM_DOC.indexOf('# Real Heading')
    expect(
      specs.some((s: DecoSpec) => s.kind === 'headingLine' && s.from === realHeadingFrom)
    ).toBe(true)
  })

  it('does not treat a lone --- (no frontmatter) specially', () => {
    const doc = 'text\n\n---\n\nmore'
    const specs = collectDecorations(stateWith(doc, 0))
    expect(specs.some((s: DecoSpec) => s.kind === 'frontmatter')).toBe(false)
    expect(specs.some((s: DecoSpec) => s.kind === 'hr')).toBe(true)
  })
})
