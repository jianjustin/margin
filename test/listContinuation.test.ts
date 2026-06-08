import { describe, it, expect } from 'vitest'
import { parseListLine, listEnterAction } from '@/editor/listContinuation'

describe('parseListLine', () => {
  it('parses an unordered bullet item', () => {
    const p = parseListLine('- hello')
    expect(p).toMatchObject({ ordered: false, bullet: '-', task: false, content: 'hello', marker: '- ' })
  })

  it('parses an ordered item with its number', () => {
    const p = parseListLine('  3. third')
    expect(p).toMatchObject({ ordered: true, number: 3, content: 'third', indent: '  ', marker: '3. ' })
  })

  it('parses a task item', () => {
    const p = parseListLine('- [ ] todo')
    expect(p).toMatchObject({ task: true, ordered: false, content: 'todo', marker: '- [ ] ' })
  })

  it('returns null for a non-list line', () => {
    expect(parseListLine('just text')).toBeNull()
  })
})

describe('listEnterAction', () => {
  // caret at end of line (lineFrom = 0)
  const atEnd = (text: string) => listEnterAction(text, 0, text.length)

  it('continues a bullet list', () => {
    expect(atEnd('- apple')).toEqual({ type: 'continue', insert: '\n- ' })
  })

  it('increments an ordered list', () => {
    expect(atEnd('2. second')).toEqual({ type: 'continue', insert: '\n3. ' })
  })

  it('continues a task list with a fresh unchecked box', () => {
    expect(atEnd('- [x] done')).toEqual({ type: 'continue', insert: '\n- [ ] ' })
  })

  it('preserves indentation when continuing', () => {
    expect(atEnd('   - nested')).toEqual({ type: 'continue', insert: '\n   - ' })
  })

  it('clears the marker on an empty item to exit the list', () => {
    // "- " has marker length 2, caret at end
    expect(listEnterAction('- ', 0, 2)).toEqual({ type: 'clear', from: 0, to: 2 })
  })

  it('clears an empty task item', () => {
    expect(listEnterAction('- [ ] ', 0, 6)).toEqual({ type: 'clear', from: 0, to: 6 })
  })

  it('returns null when the caret sits inside the marker', () => {
    expect(listEnterAction('1. text', 0, 1)).toBeNull()
  })

  it('returns null for a non-list line', () => {
    expect(atEnd('plain paragraph')).toBeNull()
  })
})
