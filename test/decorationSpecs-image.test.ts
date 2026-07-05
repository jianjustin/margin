import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

function state(doc: string, anchor = 0) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

describe('image decorations', () => {
  it('emits an image spec with url + alt when cursor is elsewhere', () => {
    const s = state('text\n\n![my alt](img/pic.png)\n\nmore', 0)
    const img = collectDecorations(s).find((d) => d.kind === 'image')
    expect(img).toBeTruthy()
    expect(img?.source).toBe('img/pic.png')
    expect(img?.info).toBe('my alt')
  })

  it('standalone image with cursor elsewhere: block placement, not revealed', () => {
    const s = state('para\n\n![a](pic.png)\n', 0)
    const img = collectDecorations(s).find((d) => d.kind === 'image')
    expect(img).toMatchObject({ placement: 'block', revealed: false })
  })

  it('cursor on image line: spec still emitted with placement block and revealed true', () => {
    const s = state('![a](pic.png)', 3)
    const img = collectDecorations(s).find((d) => d.kind === 'image')
    expect(img).toMatchObject({ placement: 'block', revealed: true })
  })

  it('inline image (preceded by text): inline placement', () => {
    const s = state('before ![a](pic.png) after', 0)
    const img = collectDecorations(s).find((d) => d.kind === 'image')
    expect(img?.placement).toBe('inline')
  })
})
