import { describe, it, expect } from 'vitest'
import { isExternal, resolveRelative } from '@/lib/resolvePath'

describe('isExternal', () => {
  it('recognizes http/https/data/asset/mailto', () => {
    expect(isExternal('https://a.com/x.png')).toBe(true)
    expect(isExternal('http://a.com')).toBe(true)
    expect(isExternal('data:image/png;base64,xx')).toBe(true)
    expect(isExternal('mailto:a@b.c')).toBe(true)
    expect(isExternal('./img/a.png')).toBe(false)
    expect(isExternal('/abs/a.png')).toBe(false)
  })
})

describe('resolveRelative', () => {
  it('resolves relative to the document directory', () => {
    expect(resolveRelative('img/a.png', '/vault/notes/n.md')).toBe('/vault/notes/img/a.png')
  })
  it('normalizes ./ and ../ segments', () => {
    expect(resolveRelative('../img/a.png', '/vault/notes/n.md')).toBe('/vault/img/a.png')
    expect(resolveRelative('./a.png', '/vault/n.md')).toBe('/vault/a.png')
  })
  it('keeps absolute paths, decodes percent-encoding', () => {
    expect(resolveRelative('/abs/a.png', '/vault/n.md')).toBe('/abs/a.png')
    expect(resolveRelative('img/a%20b.png', '/vault/n.md')).toBe('/vault/img/a b.png')
  })
  it('returns null without a document path', () => {
    expect(resolveRelative('a.png', null)).toBeNull()
  })
})
