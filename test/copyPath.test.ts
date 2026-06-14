import { describe, expect, it } from 'vitest'
import { projectRelativePath } from '@/lib/copyPath'

describe('projectRelativePath', () => {
  it('returns the path relative to the vault root', () => {
    expect(projectRelativePath('/v', '/v/folder/asset.pdf')).toBe('folder/asset.pdf')
  })

  it('normalizes backslashes before computing the relative path', () => {
    expect(projectRelativePath('C:\\vault', 'C:\\vault\\folder\\asset.pdf')).toBe('folder/asset.pdf')
  })

  it('falls back to the original path when there is no matching root', () => {
    expect(projectRelativePath('/v', '/other/asset.pdf')).toBe('/other/asset.pdf')
  })
})
