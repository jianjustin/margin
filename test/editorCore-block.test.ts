import { describe, it, expect } from 'vitest'
import {
  setHeading,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  type EditResult
} from '@/editor-core'

/** Apply an EditResult to text and return [newText, selFrom, selTo]. */
function apply(text: string, result: EditResult): [string, number, number] {
  let out = text
  for (const c of [...result.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return [out, result.selection?.from ?? 0, result.selection?.to ?? 0]
}

/** Build a single-line doc with the caret at the end. */
const caret = (text: string) => ({ text, selection: { from: text.length, to: text.length } })
/** Build a doc selecting the whole text. */
const all = (text: string) => ({ text, selection: { from: 0, to: text.length } })

describe('setHeading', () => {
  it('adds a heading prefix at the given level', () => {
    expect(apply('title', setHeading(caret('title'), 2))[0]).toBe('## title')
  })

  it('replaces an existing heading level', () => {
    expect(apply('# title', setHeading(caret('# title'), 3))[0]).toBe('### title')
  })

  it('toggles off when the line is already at that level', () => {
    expect(apply('## title', setHeading(caret('## title'), 2))[0]).toBe('title')
  })

  it('level 0 clears any heading to a paragraph', () => {
    expect(apply('#### deep', setHeading(caret('#### deep'), 0))[0]).toBe('deep')
  })

  it('applies across a multi-line selection', () => {
    const doc = all('a\nb')
    expect(apply('a\nb', setHeading(doc, 1))[0]).toBe('# a\n# b')
  })
})

describe('toggleBlockquote', () => {
  it('adds a quote prefix', () => {
    expect(apply('hello', toggleBlockquote(caret('hello')))[0]).toBe('> hello')
  })

  it('removes the prefix when every line is quoted', () => {
    const src = '> one\n> two'
    expect(apply(src, toggleBlockquote(all(src)))[0]).toBe('one\ntwo')
  })
})

describe('list toggles', () => {
  it('toggles a bullet list on and off', () => {
    const on = apply('item', toggleBulletList(caret('item')))[0]
    expect(on).toBe('- item')
    expect(apply('- item', toggleBulletList(caret('- item')))[0]).toBe('item')
  })

  it('numbers an ordered list sequentially', () => {
    const src = 'a\nb\nc'
    expect(apply(src, toggleOrderedList(all(src)))[0]).toBe('1. a\n2. b\n3. c')
  })

  it('converts a bullet line into an ordered one', () => {
    expect(apply('- x', toggleOrderedList(caret('- x')))[0]).toBe('1. x')
  })

  it('toggles a task list and strips back to plain text', () => {
    expect(apply('do', toggleTaskList(caret('do')))[0]).toBe('- [ ] do')
    expect(apply('- [x] done', toggleTaskList(caret('- [x] done')))[0]).toBe('done')
  })

  it('preserves indentation when toggling', () => {
    expect(apply('  nested', toggleBulletList(caret('  nested')))[0]).toBe('  - nested')
  })
})
