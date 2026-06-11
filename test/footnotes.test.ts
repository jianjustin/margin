import { describe, it, expect } from 'vitest'
import { collectFootnoteRefs, findFootnoteDef } from '../src/renderer/src/editor/livePreview/footnotes'

describe('collectFootnoteRefs', () => {
  it('finds refs but not definitions', () => {
    const text = 'claim[^1] and more[^note]\n\n[^1]: first def\n[^note]: second'
    const refs = collectFootnoteRefs(text)
    expect(refs.map((r) => r.label)).toEqual(['1', 'note'])
    expect(refs[0].index).toBe(5)
  })
  it('returns empty for plain text', () => {
    expect(collectFootnoteRefs('no refs here')).toEqual([])
  })
})

describe('findFootnoteDef', () => {
  const doc = 'x[^a]\n\n[^a]: the def text\n[^b]: other'
  it('finds the definition text', () => {
    expect(findFootnoteDef(doc, 'a')).toBe('the def text')
  })
  it('null for unknown labels', () => {
    expect(findFootnoteDef(doc, 'zzz')).toBeNull()
  })
})
