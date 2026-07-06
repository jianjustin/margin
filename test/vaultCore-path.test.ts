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
  movePlan,
  isSelfOrDescendant,
  canMoveInto
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

describe('isSelfOrDescendant', () => {
  it('parent === child → true', () => {
    expect(isSelfOrDescendant('a/b', 'a/b')).toBe(true)
  })

  it('child nested under parent → true', () => {
    expect(isSelfOrDescendant('a', 'a/b')).toBe(true)
    expect(isSelfOrDescendant('a/b', 'a/b/c/d')).toBe(true)
  })

  it('sibling → false', () => {
    expect(isSelfOrDescendant('a/b', 'a/c')).toBe(false)
  })

  it('prefix-but-not-path-boundary trap (a/bc is NOT descendant of a/b) → false', () => {
    expect(isSelfOrDescendant('a/b', 'a/bc')).toBe(false)
  })
})

describe('canMoveInto', () => {
  it('move into own current dir (no-op) → false', () => {
    expect(canMoveInto('/v/sub/a.md', '/v/sub')).toBe(false)
  })

  it('move node into itself → false', () => {
    expect(canMoveInto('/v/sub', '/v/sub')).toBe(false)
  })

  it('move into a descendant of itself → false', () => {
    expect(canMoveInto('/v/sub', '/v/sub/child')).toBe(false)
  })

  it('move into .obsidian (unsafe) → false', () => {
    expect(canMoveInto('/v/notes/a.md', '/v/.obsidian')).toBe(false)
  })

  it('move into .trash (unsafe) → false', () => {
    expect(canMoveInto('/v/notes/a.md', '/v/.trash')).toBe(false)
  })

  it('move into .git (unsafe) → false', () => {
    expect(canMoveInto('/v/notes/a.md', '/v/.git')).toBe(false)
  })

  it('normal valid move (different safe dir, not self/descendant) → true', () => {
    expect(canMoveInto('/v/sub/a.md', '/v/other')).toBe(true)
    expect(canMoveInto('/v/folder', '/v/other')).toBe(true)
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
