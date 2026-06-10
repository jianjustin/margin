import { describe, it, expect } from 'vitest'
import { slashMenuTriggers } from '@/editor/slashTrigger'

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
