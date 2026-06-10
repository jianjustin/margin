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

  it('does not emit an image spec when the cursor is on the image line', () => {
    const doc = '![a](p.png)'
    const s = state(doc, 3)
    expect(collectDecorations(s).find((d) => d.kind === 'image')).toBeUndefined()
  })
})
