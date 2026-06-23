import { describe, it, expect } from 'vitest'
import { toggleInlineMark, INLINE_MARKERS, type InlineMarkKind } from '@/editor-core'

/** Apply an EditResult's changes to a string and return [text, selFrom, selTo]. */
function apply(text: string, from: number, to: number, kind: InlineMarkKind): [string, number, number] {
  const result = toggleInlineMark({ text, selection: { from, to } }, kind)
  // Apply changes right-to-left so earlier offsets stay valid.
  let out = text
  for (const c of [...result.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return [out, result.selection?.from ?? from, result.selection?.to ?? to]
}

describe('toggleInlineMark — wrapping', () => {
  it('wraps a selection in bold markers', () => {
    const [text, from, to] = apply('hello world', 0, 5, 'bold')
    expect(text).toBe('**hello** world')
    expect([from, to]).toEqual([2, 7]) // "hello" stays selected, sans markers
  })

  it('wraps with italic, strike, code, highlight markers', () => {
    expect(apply('ab', 0, 2, 'italic')[0]).toBe('*ab*')
    expect(apply('ab', 0, 2, 'strike')[0]).toBe('~~ab~~')
    expect(apply('ab', 0, 2, 'code')[0]).toBe('`ab`')
    expect(apply('ab', 0, 2, 'highlight')[0]).toBe('==ab==')
  })
})

describe('toggleInlineMark — unwrapping', () => {
  it('unwraps when the selection includes the markers', () => {
    const [text, from, to] = apply('**hello** world', 0, 9, 'bold')
    expect(text).toBe('hello world')
    expect([from, to]).toEqual([0, 5])
  })

  it('unwraps when markers sit just outside the selection', () => {
    // select "hello" inside "**hello**"
    const [text, from, to] = apply('**hello** world', 2, 7, 'bold')
    expect(text).toBe('hello world')
    expect([from, to]).toEqual([0, 5])
  })

  it('round-trips: wrap then unwrap returns the original', () => {
    const original = 'round trip'
    const wrapped = toggleInlineMark({ text: original, selection: { from: 0, to: 5 } }, 'bold')
    expect(wrapped.changes[0].insert).toBe('**round**')
    // now unwrap using the wrapped result's selection
    const [text] = apply('**round** trip', wrapped.selection!.from, wrapped.selection!.to, 'bold')
    expect(text).toBe('round trip')
  })
})

describe('toggleInlineMark — empty selection', () => {
  it('inserts an empty pair with the caret between the markers', () => {
    const result = toggleInlineMark({ text: 'ab', selection: { from: 1, to: 1 } }, 'bold')
    expect(result.changes).toEqual([{ from: 1, to: 1, insert: '****' }])
    expect(result.selection).toEqual({ from: 3, to: 3 }) // caret inside the pair
  })

  it('exposes the marker table for every kind', () => {
    expect(INLINE_MARKERS).toEqual({
      bold: '**',
      italic: '*',
      strike: '~~',
      code: '`',
      highlight: '=='
    })
  })
})
