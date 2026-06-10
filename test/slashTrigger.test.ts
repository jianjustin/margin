import { describe, it, expect } from 'vitest'
import { slashMenuTriggers, slashInsertedAt } from '@/editor/slashTrigger'
import { EditorState } from '@codemirror/state'

describe('slashMenuTriggers', () => {
  it('opens at the start of a line (no char before)', () => {
    expect(slashMenuTriggers('')).toBe(true)
  })

  it('opens right after whitespace', () => {
    expect(slashMenuTriggers(' ')).toBe(true)
    expect(slashMenuTriggers('\t')).toBe(true)
  })

  it('does not open mid-word / after punctuation (e.g. http://)', () => {
    expect(slashMenuTriggers('a')).toBe(false)
    expect(slashMenuTriggers('p')).toBe(false) // the "p" in "http:/"
    expect(slashMenuTriggers(':')).toBe(false)
    expect(slashMenuTriggers('/')).toBe(false)
  })
})

function tr(doc: string, at: number, insert: string, userEvent?: string) {
  const state = EditorState.create({ doc, selection: { anchor: at } })
  return state.update({
    changes: { from: at, insert },
    ...(userEvent ? { userEvent } : {})
  })
}

describe('slashInsertedAt', () => {
  it('detects "/" typed at line start (returns pos after the slash)', () => {
    expect(slashInsertedAt(tr('', 0, '/', 'input.type'))).toBe(1)
  })

  it('detects "/" inserted by IME composition (input.type.compose)', () => {
    expect(slashInsertedAt(tr('你好 ', 3, '/', 'input.type.compose'))).toBe(4)
  })

  it('detects "/" after whitespace mid-line', () => {
    expect(slashInsertedAt(tr('- ', 2, '/', 'input.type'))).toBe(3)
  })

  it('ignores "/" after a non-space char (http://)', () => {
    expect(slashInsertedAt(tr('http:/', 6, '/', 'input.type'))).toBeNull()
  })

  it('ignores pasted "/"', () => {
    expect(slashInsertedAt(tr('', 0, '/', 'input.paste'))).toBeNull()
  })

  it('ignores multi-char insertions and non-user transactions', () => {
    expect(slashInsertedAt(tr('', 0, 'a/', 'input.type'))).toBeNull()
    expect(slashInsertedAt(tr('', 0, '/'))).toBeNull()
  })
})
