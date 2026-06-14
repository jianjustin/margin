import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const THEME_SOURCE = 'src/renderer/src/editor/livePreview/theme.ts'

describe('editor theme safety', () => {
  it('does not put vertical margins on CodeMirror line decorations', () => {
    const source = readFileSync(THEME_SOURCE, 'utf8')
    const lineDecorationRules = Array.from(
      source.matchAll(/'\.cm-h[1-6]'\s*:\s*\{(?<body>[^}]+)\}/g)
    )

    expect(lineDecorationRules.length).toBeGreaterThan(0)
    for (const rule of lineDecorationRules) {
      expect(rule.groups?.body ?? '').not.toMatch(/margin(?:Top|Bottom)?\s*:/)
    }
  })
})
