import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

function stateFor(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

describe('wiki link decoration specs', () => {
  it('emits a wikiLink spec for [[target]] when cursor is on another line', () => {
    const doc = 'See [[my-note]] here\n\nAnother line'
    const state = stateFor(doc, doc.indexOf('Another'))
    const specs = collectDecorations(state)
    const wiki = specs.find(s => s.kind === 'wikiLink')
    expect(wiki).toBeDefined()
    expect(wiki?.from).toBe(doc.indexOf('[['))
    expect(wiki?.to).toBe(doc.indexOf(']]') + 2)
    expect(wiki?.info).toBe('my-note')
    expect(wiki?.revealed).toBe(false)
  })

  it('marks the spec as revealed when cursor is on the same line', () => {
    const doc = 'See [[my-note]] here'
    const state = stateFor(doc, 10)
    const specs = collectDecorations(state)
    const wiki = specs.find(s => s.kind === 'wikiLink')
    expect(wiki).toBeDefined()
    expect(wiki?.revealed).toBe(true)
  })

  it('uses the display text from [[target|display]]', () => {
    const doc = '[[My Note|display text]]\n\nOther line'
    const state = stateFor(doc, doc.indexOf('Other'))
    const specs = collectDecorations(state)
    const wiki = specs.find(s => s.kind === 'wikiLink')
    expect(wiki?.source).toBe('display text')
    expect(wiki?.info).toBe('My Note')
  })

  it('does not emit wiki spec inside a fenced code block', () => {
    const doc = '```\n[[wiki]]\n```\n\nParagraph'
    const state = stateFor(doc, doc.indexOf('Paragraph'))
    const specs = collectDecorations(state)
    expect(specs.find(s => s.kind === 'wikiLink')).toBeUndefined()
  })

  it('does not emit wiki spec inside inline code', () => {
    const doc = 'Use `[[wiki]]` as example\n\nOther'
    const state = stateFor(doc, doc.indexOf('Other'))
    const specs = collectDecorations(state)
    expect(specs.find(s => s.kind === 'wikiLink')).toBeUndefined()
  })
})
