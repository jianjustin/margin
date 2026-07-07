import { describe, it, expect } from 'vitest'
import { insertTextForVaultPath } from '@/lib/insertDropText'

describe('insertTextForVaultPath', () => {
  it('markdown file → wiki link', () => {
    expect(insertTextForVaultPath('notes/foo.md')).toBe('[[foo]]')
  })

  it('markdown uppercase extension', () => {
    expect(insertTextForVaultPath('notes/Bar.MD')).toBe('[[Bar]]')
  })

  it('png image → markdown image', () => {
    expect(insertTextForVaultPath('assets/photo.png')).toBe('![photo](assets/photo.png)')
  })

  it('jpg image → markdown image', () => {
    expect(insertTextForVaultPath('images/hero.jpg')).toBe('![hero](images/hero.jpg)')
  })

  it('webp image → markdown image', () => {
    expect(insertTextForVaultPath('assets/banner.webp')).toBe('![banner](assets/banner.webp)')
  })

  it('svg image → markdown image', () => {
    expect(insertTextForVaultPath('icons/logo.svg')).toBe('![logo](icons/logo.svg)')
  })

  it('other file → generic link', () => {
    expect(insertTextForVaultPath('docs/spec.pdf')).toBe('[spec.pdf](docs/spec.pdf)')
  })

  it('filename with spaces (URL-encoded path)', () => {
    expect(insertTextForVaultPath('notes/my%20note.md')).toBe('[[my%20note]]')
  })

  it('deeply nested path', () => {
    expect(insertTextForVaultPath('a/b/c/deep.md')).toBe('[[deep]]')
  })

  it('root-level file', () => {
    expect(insertTextForVaultPath('readme.md')).toBe('[[readme]]')
  })

  it('image at root level', () => {
    expect(insertTextForVaultPath('cover.jpeg')).toBe('![cover](cover.jpeg)')
  })
})
