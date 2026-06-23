import { describe, it, expect } from 'vitest'
import { moveLines, duplicateLines, wrapLink, type EditResult } from '@/editor-core'

function apply(text: string, result: EditResult | null): [string, number, number] {
  if (!result) return [text, -1, -1]
  let out = text
  for (const c of [...result.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return [out, result.selection?.from ?? 0, result.selection?.to ?? 0]
}

/** Place a caret on the line at `lineIndex` (0-based) of `text`. */
function caretOnLine(text: string, lineIndex: number) {
  const lines = text.split('\n')
  let pos = 0
  for (let i = 0; i < lineIndex; i++) pos += lines[i].length + 1
  return { text, selection: { from: pos, to: pos } }
}

describe('moveLines', () => {
  const doc = 'one\ntwo\nthree'

  it('moves a line up', () => {
    expect(apply(doc, moveLines(caretOnLine(doc, 1), -1))[0]).toBe('two\none\nthree')
  })

  it('moves a line down', () => {
    expect(apply(doc, moveLines(caretOnLine(doc, 1), 1))[0]).toBe('one\nthree\ntwo')
  })

  it('is a no-op at the top edge moving up', () => {
    expect(moveLines(caretOnLine(doc, 0), -1)).toBeNull()
  })

  it('is a no-op at the bottom edge moving down', () => {
    expect(moveLines(caretOnLine(doc, 2), 1)).toBeNull()
  })

  it('keeps the moved line selected', () => {
    const [text, from, to] = apply(doc, moveLines(caretOnLine(doc, 1), -1))
    expect(text.slice(from, to)).toBe('two')
  })
})

describe('duplicateLines', () => {
  it('duplicates the current line below and selects the copy', () => {
    const doc = 'alpha\nbeta'
    const [text, from, to] = apply(doc, duplicateLines(caretOnLine(doc, 0)))
    expect(text).toBe('alpha\nalpha\nbeta')
    expect(text.slice(from, to)).toBe('alpha')
  })
})

describe('wrapLink', () => {
  it('wraps a selection and selects the URL slot', () => {
    const result = wrapLink({ text: 'click here', selection: { from: 0, to: 5 } }, 'https://x')
    const [text, from, to] = apply('click here', result)
    expect(text).toBe('[click](https://x) here')
    expect(text.slice(from, to)).toBe('https://x')
  })

  it('inserts an empty link with the caret in the label on empty selection', () => {
    const result = wrapLink({ text: '', selection: { from: 0, to: 0 } })
    expect(result.changes).toEqual([{ from: 0, to: 0, insert: '[]()' }])
    expect(result.selection).toEqual({ from: 1, to: 1 })
  })
})
