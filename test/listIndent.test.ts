import { describe, it, expect } from 'vitest'
import { indentListLine, outdentListLine } from '@/editor/listContinuation'

describe('indentListLine', () => {
  it('prepends 2 spaces to a top-level bullet item', () => {
    expect(indentListLine('- item')).toBe('  - item')
  })
  it('prepends 2 more spaces to an already-indented bullet', () => {
    expect(indentListLine('  - item')).toBe('    - item')
  })
  it('works with ordered list items', () => {
    expect(indentListLine('1. first')).toBe('  1. first')
  })
  it('works with task list items', () => {
    expect(indentListLine('- [ ] task')).toBe('  - [ ] task')
  })
  it('returns null for non-list lines', () => {
    expect(indentListLine('plain text')).toBeNull()
    expect(indentListLine('# heading')).toBeNull()
  })
})

describe('outdentListLine', () => {
  it('removes 2 leading spaces from indented bullet', () => {
    expect(outdentListLine('  - item')).toBe('- item')
  })
  it('removes only 1 space when indent is 1', () => {
    expect(outdentListLine(' - item')).toBe('- item')
  })
  it('removes only 2 spaces when indent is 4 (moves up one level)', () => {
    expect(outdentListLine('    - item')).toBe('  - item')
  })
  it('returns null when there is no indent', () => {
    expect(outdentListLine('- item')).toBeNull()
  })
  it('returns null for non-list lines', () => {
    expect(outdentListLine('plain text')).toBeNull()
  })
})
