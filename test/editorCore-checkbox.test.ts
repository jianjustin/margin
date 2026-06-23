import { describe, it, expect } from 'vitest'
import { toggleTaskOnLine, isTaskLine } from '@/editor-core'

describe('toggleTaskOnLine', () => {
  it('checks an unchecked task', () => {
    expect(toggleTaskOnLine('- [ ] buy milk')).toEqual({ from: 2, to: 5, insert: '[x]' })
  })

  it('unchecks a checked task', () => {
    expect(toggleTaskOnLine('- [x] done')).toEqual({ from: 2, to: 5, insert: '[ ]' })
  })

  it('treats uppercase [X] as checked', () => {
    expect(toggleTaskOnLine('- [X] done')).toEqual({ from: 2, to: 5, insert: '[ ]' })
  })

  it('reports the marker offset under leading indentation', () => {
    // "    - [ ]" → '[' is at index 6
    expect(toggleTaskOnLine('    - [ ] nested')).toEqual({ from: 6, to: 9, insert: '[x]' })
  })

  it('works with ordered-list task items', () => {
    expect(toggleTaskOnLine('1. [ ] first')).toEqual({ from: 3, to: 6, insert: '[x]' })
  })

  it('returns null for a plain list item or text', () => {
    expect(toggleTaskOnLine('- not a task')).toBeNull()
    expect(toggleTaskOnLine('just text')).toBeNull()
  })
})

describe('isTaskLine', () => {
  it('is true only for task items', () => {
    expect(isTaskLine('- [ ] todo')).toBe(true)
    expect(isTaskLine('* [x] done')).toBe(true)
    expect(isTaskLine('- plain')).toBe(false)
    expect(isTaskLine('paragraph')).toBe(false)
  })
})
