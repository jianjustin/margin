import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { linkUrlAt } from '../src/renderer/src/editor/livePreview/linkAt'

function state(doc: string) {
  const s = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  ensureSyntaxTree(s, doc.length, 5000)
  return s
}

describe('linkUrlAt', () => {
  it('returns the URL when pos is inside a link', () => {
    const s = state('see [docs](https://example.com) here')
    expect(linkUrlAt(s, 6)).toBe('https://example.com')
  })
  it('returns the target of a relative md link', () => {
    const s = state('see [note](../notes/other.md)')
    expect(linkUrlAt(s, 6)).toBe('../notes/other.md')
  })
  it('returns a wiki target when pos is inside a wiki link', () => {
    const s = state('see [[target]] here')
    expect(linkUrlAt(s, 7)).toBe('wiki:target')
  })
  it('returns null outside links', () => {
    const s = state('plain text')
    expect(linkUrlAt(s, 2)).toBeNull()
  })
})
