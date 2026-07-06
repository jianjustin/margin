import { describe, it, expect } from 'vitest'
import { collectOutline } from '@/editor-core'

describe('collectOutline', () => {
  it('detects H1/H2/H3 headings with their line numbers', () => {
    const text = ['# Title', 'body', '## Section', 'more', '### Sub', 'tail'].join('\n')
    expect(collectOutline(text)).toEqual([
      { level: 1, text: 'Title', line: 0 },
      { level: 2, text: 'Section', line: 2 },
      { level: 3, text: 'Sub', line: 4 }
    ])
  })

  it('ignores non-heading lines and headings deeper than H3', () => {
    const text = ['not a heading', '#### too deep', 'plain #not-heading', '#no-space'].join('\n')
    expect(collectOutline(text)).toEqual([])
  })

  it('returns an empty array for an empty document', () => {
    expect(collectOutline('')).toEqual([])
  })

  it('trims trailing whitespace from heading text', () => {
    expect(collectOutline('#   Spaced Title   ')).toEqual([{ level: 1, text: 'Spaced Title', line: 0 }])
  })

  it('skips headings inside fenced code blocks', () => {
    const text = ['# Real', '```', '# Not a heading', '```', '## Also Real'].join('\n')
    expect(collectOutline(text)).toEqual([
      { level: 1, text: 'Real', line: 0 },
      { level: 2, text: 'Also Real', line: 4 }
    ])
  })

  it('skips headings inside frontmatter at the top of the document', () => {
    const text = ['---', 'title: # Not a heading', '---', '# Real Title'].join('\n')
    expect(collectOutline(text)).toEqual([{ level: 1, text: 'Real Title', line: 3 }])
  })

  it('does not treat frontmatter delimiters as such unless they open on line 0', () => {
    const text = ['body', '---', '# Title'].join('\n')
    expect(collectOutline(text)).toEqual([{ level: 1, text: 'Title', line: 2 }])
  })
})
