import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

const DOC = [
  '---',
  'title: Doc',
  'tags: a, b',
  '---',
  '',
  '# Heading One',
  '',
  'prose anchor with **bold**, *italic*, ~~struck~~, `inline code`, ==mark== text.',
  '',
  '> plain quote line',
  '',
  '> [!note] Callout title',
  '> callout body',
  '',
  '- [x] done task',
  '- [ ] pending task',
  '- plain bullet',
  '',
  '1. first',
  '2. second',
  '',
  'A [link](https://example.com) and [[Wiki Target|shown]] and a footnote[^fn].',
  '',
  '[^fn]: footnote definition',
  '',
  '---',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '![standalone](pic.png)',
  '',
  'inline ![img](inline.png) here, media ![clip](clip.mp4 =320x)',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  'inline math $a+b$ end'
].join('\n')

const SPEC_KEYS = [
  'kind', 'from', 'to', 'revealed', 'level', 'checked', 'info',
  'source', 'width', 'height', 'title', 'folded', 'placement'
]

function stateWith(anchor: number): EditorState {
  return EditorState.create({
    doc: DOC,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

/** 去重 + 排序的规格集合：对 spec 顺序与重复不敏感，只对内容敏感。 */
function normalized(specs: DecoSpec[]): string[] {
  const seen = new Set<string>()
  for (const s of specs) seen.add(JSON.stringify(s, SPEC_KEYS))
  return [...seen].sort()
}

describe('collectDecorations 特征化（拆分护栏）', () => {
  it('光标在正文段落', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('prose anchor'))))).toMatchSnapshot()
  })
  it('光标在代码块内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('const x'))))).toMatchSnapshot()
  })
  it('光标在表格内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('| 1 |'))))).toMatchSnapshot()
  })
  it('光标在 callout 内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('callout body'))))).toMatchSnapshot()
  })
  it('光标在 frontmatter 内', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('title:'))))).toMatchSnapshot()
  })
  it('光标在 standalone 图片行', () => {
    expect(normalized(collectDecorations(stateWith(DOC.indexOf('![standalone]') + 3)))).toMatchSnapshot()
  })
})
