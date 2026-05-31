import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanVault } from '../src/main/vaultScanner'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'margin-scan-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanVault', () => {
  it('includes markdown files and folders, folders first then files, alpha sorted', () => {
    writeFileSync(join(root, 'beta.md'), '')
    writeFileSync(join(root, 'alpha.md'), '')
    mkdirSync(join(root, 'zfolder'))
    mkdirSync(join(root, 'afolder'))
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['afolder', 'zfolder', 'alpha.md', 'beta.md'])
    expect(tree[0].type).toBe('folder')
    expect(tree[2].type).toBe('file')
  })

  it('skips dotfiles and dot-directories', () => {
    writeFileSync(join(root, 'note.md'), '')
    writeFileSync(join(root, '.hidden.md'), '')
    mkdirSync(join(root, '.obsidian'))
    writeFileSync(join(root, '.obsidian', 'config.md'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['note.md'])
  })

  it('skips non-markdown files', () => {
    writeFileSync(join(root, 'keep.md'), '')
    writeFileSync(join(root, 'skip.txt'), '')
    writeFileSync(join(root, 'skip.png'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['keep.md'])
  })

  it('recurses into subfolders with correct nesting and absolute paths', () => {
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'inner.md'), '')
    const tree = scanVault(root)
    expect(tree[0].name).toBe('sub')
    expect(tree[0].children?.[0].name).toBe('inner.md')
    expect(tree[0].children?.[0].path).toBe(join(root, 'sub', 'inner.md'))
  })

  it('keeps empty folders', () => {
    mkdirSync(join(root, 'empty'))
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['empty'])
    expect(tree[0].children).toEqual([])
  })

  it('accepts .markdown extension too', () => {
    writeFileSync(join(root, 'a.markdown'), '')
    const tree = scanVault(root)
    expect(tree.map((n) => n.name)).toEqual(['a.markdown'])
  })
})
