import { describe, it, expect } from 'vitest'
import {
  isPathSafe,
  assertSafePath,
  dirname,
  basename,
  joinPath,
  splitExt,
  uniqueName,
  renamePlan,
  movePlan
} from '@/vault-core'

describe('path safety', () => {
  it('rejects Obsidian/git internal folders', () => {
    expect(isPathSafe('/v/notes/a.md')).toBe(true)
    expect(isPathSafe('/v/.obsidian/app.json')).toBe(false)
    expect(isPathSafe('/v/.trash/old.md')).toBe(false)
    expect(isPathSafe('/v/.git/config')).toBe(false)
  })

  it('assertSafePath throws on unsafe paths', () => {
    expect(() => assertSafePath('/v/.git/x')).toThrow(/unsafe path/)
    expect(() => assertSafePath('/v/ok.md')).not.toThrow()
  })
})

describe('path helpers', () => {
  it('dirname / basename', () => {
    expect(dirname('/v/sub/a.md')).toBe('/v/sub')
    expect(basename('/v/sub/a.md')).toBe('a.md')
  })

  it('joinPath', () => {
    expect(joinPath('/v/sub', 'a.md')).toBe('/v/sub/a.md')
    expect(joinPath('/v/sub/', 'a.md')).toBe('/v/sub/a.md')
  })

  it('splitExt', () => {
    expect(splitExt('note.md')).toEqual(['note', '.md'])
    expect(splitExt('README')).toEqual(['README', ''])
    expect(splitExt('.gitignore')).toEqual(['.gitignore', ''])
  })
})

describe('uniqueName', () => {
  it('returns the desired name when free', () => {
    expect(uniqueName(['a.md'], 'b.md')).toBe('b.md')
  })

  it('suffixes before the extension on collision', () => {
    expect(uniqueName(['note.md'], 'note.md')).toBe('note-1.md')
    expect(uniqueName(['note.md', 'note-1.md'], 'note.md')).toBe('note-2.md')
  })
})

describe('rename / move plans', () => {
  it('renamePlan keeps the directory', () => {
    expect(renamePlan('/v/sub/a.md', 'b.md')).toEqual({ from: '/v/sub/a.md', to: '/v/sub/b.md' })
  })

  it('movePlan keeps the name', () => {
    expect(movePlan('/v/sub/a.md', '/v/other')).toEqual({ from: '/v/sub/a.md', to: '/v/other/a.md' })
  })
})
