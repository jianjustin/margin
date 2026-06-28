import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EDITOR_SOURCE = 'src/renderer/src/components/Editor.tsx'

describe('editor layout', () => {
  it('keeps the markdown body at the Lettera readable column width', () => {
    const source = readFileSync(EDITOR_SOURCE, 'utf8')
    const contentTheme = source.match(/'\.cm-content':\s*\{(?<body>[\s\S]*?)\n\s*\}/)
    const maxWidth = contentTheme?.groups?.body.match(/maxWidth:\s*'(?<value>\d+)px'/)

    expect(Number(maxWidth?.groups?.value)).toBe(600)
  })
})
