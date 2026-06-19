import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, type DecoSpec } from '@/editor/livePreview/decorationSpecs'

function state(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

function byKind(specs: DecoSpec[], kind: DecoSpec['kind']): DecoSpec | undefined {
  return specs.find((spec) => spec.kind === kind)
}

describe('v2.4 rich content decorations', () => {
  it('routes mermaid, plantuml, and dot fences to diagram specs while cursor is outside', () => {
    const doc = [
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '```plantuml',
      '@startuml',
      'Alice -> Bob',
      '@enduml',
      '```',
      '',
      '```dot',
      'digraph { A -> B }',
      '```',
      '',
      'body'
    ].join('\n')

    const specs = collectDecorations(state(doc, doc.length))
    const diagrams = specs.filter((spec) => spec.kind === 'diagramBlock')

    expect(diagrams).toHaveLength(3)
    expect(diagrams.map((spec) => spec.info)).toEqual(['mermaid', 'plantuml', 'dot'])
    expect(diagrams[0].source).toContain('flowchart LR')
    expect(specs.some((spec) => spec.kind === 'codeBlock')).toBe(false)
  })

  it('reveals a diagram fence as raw code lines when cursor enters the block', () => {
    const doc = ['```mermaid', 'flowchart LR', '  A --> B', '```', '', 'body'].join('\n')
    const specs = collectDecorations(state(doc, doc.indexOf('flowchart')))

    expect(specs.some((spec) => spec.kind === 'diagramBlock')).toBe(false)
    expect(specs.some((spec) => spec.kind === 'codeLine')).toBe(true)
  })

  it('emits inline and block math specs only outside the active formula line', () => {
    const doc = ['This is $a^2 + b^2$ inline.', '', '$$', 'E = mc^2', '$$', '', 'body'].join('\n')
    const specs = collectDecorations(state(doc, doc.length))

    const inline = byKind(specs, 'mathInline')
    const block = byKind(specs, 'mathBlock')
    expect(inline?.source).toBe('a^2 + b^2')
    expect(block?.source).toBe('E = mc^2')

    const revealed = collectDecorations(state(doc, doc.indexOf('a^2')))
    expect(revealed.some((spec) => spec.kind === 'mathInline')).toBe(false)
  })

  it('emits Obsidian callout specs with type, fold state, title, and source body', () => {
    const doc = ['> [!warning]- Check this', '> Line one', '> Line two', '', 'body'].join('\n')
    const callout = byKind(collectDecorations(state(doc, doc.length)), 'callout')

    expect(callout).toMatchObject({
      kind: 'callout',
      info: 'warning',
      folded: true,
      title: 'Check this',
      source: 'Line one\nLine two'
    })
  })

  it('emits highlight specs for ==marked== text outside code', () => {
    const doc = 'Normal ==marked text== and `==code==`.\n\nbody'
    const highlights = collectDecorations(state(doc, doc.length)).filter((spec) => spec.kind === 'highlight')

    expect(highlights).toHaveLength(1)
    expect(doc.slice(highlights[0].from, highlights[0].to)).toBe('marked text')
  })

  it('parses image display width and media links from markdown image syntax', () => {
    const doc = [
      '![diagram|500](assets/diagram.png)',
      '',
      '![clip](assets/demo.mp4 =640x)',
      '',
      'body'
    ].join('\n')
    const specs = collectDecorations(state(doc, doc.length))
    const image = specs.find((spec) => spec.kind === 'image')
    const media = specs.find((spec) => spec.kind === 'media')

    expect(image).toMatchObject({
      kind: 'image',
      source: 'assets/diagram.png',
      info: 'diagram',
      width: 500
    })
    expect(media).toMatchObject({
      kind: 'media',
      source: 'assets/demo.mp4',
      info: 'clip',
      width: 640
    })
  })
})
