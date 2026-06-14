// test/inlineMarkdown.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderInlineMarkdown } from '@/editor/livePreview/inlineMarkdown'

function toHtml(text: string): string {
  const div = document.createElement('div')
  div.appendChild(renderInlineMarkdown(text))
  return div.innerHTML
}

function toText(text: string): string {
  const div = document.createElement('div')
  div.appendChild(renderInlineMarkdown(text))
  return div.textContent ?? ''
}

describe('renderInlineMarkdown', () => {
  it('returns plain text unchanged', () => {
    expect(toText('hello world')).toBe('hello world')
    expect(toHtml('hello world')).toBe('hello world')
  })

  it('renders **bold** as <strong>', () => {
    expect(toHtml('before **bold** after')).toBe('before <strong>bold</strong> after')
  })

  it('renders *italic* as <em>', () => {
    expect(toHtml('*it*')).toBe('<em>it</em>')
  })

  it('renders ~~strike~~ as <s>', () => {
    expect(toHtml('~~del~~')).toBe('<s>del</s>')
  })

  it('renders `code` as <code>', () => {
    expect(toHtml('use `foo()`')).toBe('use <code>foo()</code>')
  })

  it('renders [text](url) as <a>', () => {
    const html = toHtml('[click](https://example.com)')
    expect(html).toContain('<a ')
    expect(html).toContain('click')
    expect(html).toContain('https://example.com')
  })

  it('handles mixed inline markers in sequence', () => {
    expect(toHtml('**bold** and *italic*')).toBe('<strong>bold</strong> and <em>italic</em>')
  })

  it('code span wins over bold markers inside it', () => {
    expect(toHtml('`**not bold**`')).toBe('<code>**not bold**</code>')
  })

  it('preserves surrounding text', () => {
    expect(toText('a *b* c')).toBe('a b c')
  })

  it('renders wiki links with the shared internal-link treatment', () => {
    const div = document.createElement('div')
    div.appendChild(renderInlineMarkdown('See [[Target Note|display name]] now'))
    const link = div.querySelector('.cm-wiki-link') as HTMLElement
    expect(link).not.toBeNull()
    expect(link.dataset.wikiTarget).toBe('Target Note')
    expect(link.textContent).toContain('display name')
    expect(link.textContent).not.toContain('📝')
    expect(link.querySelector('.cm-wiki-link-glyph')).not.toBeNull()
  })

  it('notifies when a rendered wiki link is clicked', () => {
    const opened: string[] = []
    const div = document.createElement('div')
    div.appendChild(
      renderInlineMarkdown('See [[Target Note]]', {
        onWikiLinkClick: (target) => opened.push(target)
      })
    )
    const link = div.querySelector('.cm-wiki-link') as HTMLElement
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(opened).toEqual(['Target Note'])
  })
})
