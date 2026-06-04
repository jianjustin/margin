import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ shell: { trashItem: vi.fn().mockResolvedValue(undefined) } }))

import { renamePath } from '../src/main/fsOps'

describe('renamePath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'margin-fsops-'))
    return () => rmSync(dir, { recursive: true, force: true })
  })

  it('renames to a free target unchanged', async () => {
    writeFileSync(join(dir, 'old.md'), 'x')
    const result = await renamePath(join(dir, 'old.md'), 'new.md')
    expect(result).toBe(join(dir, 'new.md'))
    expect(existsSync(join(dir, 'old.md'))).toBe(false)
    expect(existsSync(join(dir, 'new.md'))).toBe(true)
  })

  it('avoids overwriting an existing target by disambiguating with -1, -2, …', async () => {
    writeFileSync(join(dir, 'old.md'), 'moving')
    writeFileSync(join(dir, 'taken.md'), 'do-not-clobber')
    const result = await renamePath(join(dir, 'old.md'), 'taken.md')
    expect(result).toBe(join(dir, 'taken-1.md'))
    expect(readFileSync(join(dir, 'taken.md'), 'utf-8')).toBe('do-not-clobber')
    expect(readFileSync(join(dir, 'taken-1.md'), 'utf-8')).toBe('moving')
  })

  it('is a no-op when renaming to the same name', async () => {
    writeFileSync(join(dir, 'same.md'), 'content')
    const result = await renamePath(join(dir, 'same.md'), 'same.md')
    expect(result).toBe(join(dir, 'same.md'))
    expect(readFileSync(join(dir, 'same.md'), 'utf-8')).toBe('content')
  })
})
