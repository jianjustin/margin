import { describe, it, expect } from 'vitest'
import { fileExt, isMarkdownFile, isImagePath } from '@/lib/fileKinds'

describe('fileExt', () => {
  it('returns lowercase extension', () => {
    expect(fileExt('Foo.TXT')).toBe('txt')
  })

  it('returns empty string for no extension', () => {
    expect(fileExt('Makefile')).toBe('')
  })
})

describe('isMarkdownFile', () => {
  it('recognizes .md', () => expect(isMarkdownFile('note.md')).toBe(true))
  it('recognizes .mdx', () => expect(isMarkdownFile('page.mdx')).toBe(true))
  it('rejects .txt', () => expect(isMarkdownFile('note.txt')).toBe(false))
})

describe('isImagePath', () => {
  it.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'])(
    'recognizes .%s',
    (ext) => {
      expect(isImagePath(`file.${ext}`)).toBe(true)
    }
  )

  it('rejects .pdf', () => expect(isImagePath('doc.pdf')).toBe(false))
  it('rejects .md', () => expect(isImagePath('note.md')).toBe(false))
  it('works on full path', () => expect(isImagePath('assets/img/photo.PNG')).toBe(true))
})
