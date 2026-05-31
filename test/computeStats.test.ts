import { describe, it, expect } from 'vitest'
import { computeStats } from '@/lib/computeStats'

describe('computeStats', () => {
  it('counts CJK characters', () => {
    const s = computeStats('你好世界')
    expect(s.chars).toBe(4)
    expect(s.words).toBe(4)
  })

  it('counts English words (not letters)', () => {
    const s = computeStats('hello world foo')
    expect(s.chars).toBe(0)
    expect(s.words).toBe(3)
  })

  it('mixes CJK chars and English words', () => {
    const s = computeStats('你好 hello world')
    expect(s.chars).toBe(2)
    expect(s.words).toBe(4)
  })

  it('treats hyphenated/apostrophe words as one', () => {
    const s = computeStats("don't well-being")
    expect(s.words).toBe(2)
  })

  it('is all zero for an empty document', () => {
    expect(computeStats('')).toEqual({ chars: 0, words: 0, minutes: 0, blocks: 0 })
  })

  it('minutes is at least 1 when there are words', () => {
    expect(computeStats('hello').minutes).toBe(1)
  })

  it('minutes scales by ~320 words/min', () => {
    const words = Array.from({ length: 640 }, () => 'word').join(' ')
    expect(computeStats(words).minutes).toBe(2)
  })

  it('counts blocks separated by blank lines (non-empty only)', () => {
    const doc = '# Title\n\nFirst paragraph.\n\n\nSecond paragraph.'
    expect(computeStats(doc).blocks).toBe(3)
  })

  it('a single paragraph is one block', () => {
    expect(computeStats('just one line').blocks).toBe(1)
  })
})
