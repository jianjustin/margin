import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('tauri security config', () => {
  it('allows nested local files through the asset protocol', () => {
    const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))

    expect(config.app.security.assetProtocol.enable).toBe(true)
    expect(config.app.security.assetProtocol.scope).toContain('$HOME/**')
  })
})
