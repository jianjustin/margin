import { describe, it, expect } from 'vitest'
import { isSafePath, assertSafePath } from '../src/main/pathPolicy'

describe('isSafePath', () => {
  it('accepts ordinary vault paths', () => {
    expect(isSafePath('/Users/me/vault/notes/idea.md')).toBe(true)
    expect(isSafePath('/Users/me/vault/sub/deep/file.md')).toBe(true)
    expect(isSafePath('relative/path.md')).toBe(true)
    expect(isSafePath('/just-a-file.md')).toBe(true)
  })

  it('rejects paths that touch .obsidian / .trash / .git at any depth', () => {
    expect(isSafePath('/Users/me/vault/.obsidian/config.json')).toBe(false)
    expect(isSafePath('/Users/me/vault/.git/HEAD')).toBe(false)
    expect(isSafePath('/Users/me/vault/.trash/old.md')).toBe(false)
    expect(isSafePath('/Users/me/vault/sub/.obsidian/foo')).toBe(false)
  })

  it('rejects a bare protected segment (creating it directly)', () => {
    expect(isSafePath('.obsidian')).toBe(false)
    expect(isSafePath('.trash')).toBe(false)
    expect(isSafePath('.git')).toBe(false)
  })

  it('does not match prefixes of protected names', () => {
    expect(isSafePath('/Users/me/vault/.obsidianxyz/file')).toBe(true)
    expect(isSafePath('/Users/me/vault/obsidian/foo')).toBe(true)
    expect(isSafePath('/Users/me/vault/gitignore.md')).toBe(true)
  })

  it('handles Windows-style separators', () => {
    expect(isSafePath('C:\\Users\\me\\vault\\.obsidian\\config')).toBe(false)
    expect(isSafePath('C:\\Users\\me\\vault\\note.md')).toBe(true)
  })

  it('rejects empty string defensively', () => {
    expect(isSafePath('')).toBe(false)
  })
})

describe('assertSafePath', () => {
  it('returns normally for safe paths', () => {
    expect(() => assertSafePath('/Users/me/vault/note.md')).not.toThrow()
  })

  it('throws with a descriptive message on protected paths', () => {
    expect(() => assertSafePath('/v/.obsidian/config')).toThrow(/protected/i)
  })
})
