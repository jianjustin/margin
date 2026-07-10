import { describe, it, expect } from 'vitest'
import { BUILTIN_PLUGIN_MANIFESTS } from '@/plugin-api/builtins/registry'

describe('BUILTIN_PLUGIN_MANIFESTS', () => {
  it('lists the outline and schedule manifests, in that order', () => {
    expect(BUILTIN_PLUGIN_MANIFESTS.map((m) => m.id)).toEqual(['builtin.outline', 'builtin.schedule'])
  })

  it('every manifest has a non-empty description and at least one permission', () => {
    for (const m of BUILTIN_PLUGIN_MANIFESTS) {
      expect(m.description).toBeTruthy()
      expect(m.permissions?.length).toBeGreaterThan(0)
    }
  })
})
