// test/decorationSpecs-viewport.test.ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  collectInlineDecorations,
  collectBlockDecorations
} from '@/editor/livePreview/decorationSpecs'

function stateWith(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

function manyParas(n: number): string {
  return Array.from({ length: n }, (_, i) => `para ${i} with **bold ${i}** and [[W${i}]]`).join('\n\n')
}

describe('collectInlineDecorations — 范围限定', () => {
  it('只产出与给定范围（按整行扩展）相交的 spec', () => {
    const state = stateWith(manyParas(100))
    const l40 = state.doc.line(79) // para 39 所在行（隔行空行，para i 在 line 2i+1）
    const l50 = state.doc.line(101)
    const specs = collectInlineDecorations(state, l40.from, l50.to)
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(s.to).toBeGreaterThanOrEqual(l40.from)
      expect(s.from).toBeLessThanOrEqual(l50.to)
    }
  })

  it('范围外的 bold / wiki 不产出', () => {
    const state = stateWith(manyParas(100))
    const specs = collectInlineDecorations(state, 0, state.doc.line(21).to)
    expect(specs.some((s) => s.kind === 'bold' && state.doc.sliceString(s.from, s.to).includes('bold 90'))).toBe(false)
    expect(specs.some((s) => s.kind === 'wikiLink' && s.info === 'W90')).toBe(false)
  })

  it('隐藏的代码块内部不产出 inline spec（fence 标记等）', () => {
    const doc = 'cursor line\n\n```js\nconst a = **not bold** \n```\n'
    const state = stateWith(doc, 0)
    const specs = collectInlineDecorations(state, 0, doc.length)
    const fenceFrom = doc.indexOf('```js')
    expect(specs.some((s) => s.from >= fenceFrom && s.kind !== 'image' && s.kind !== 'media')).toBe(false)
  })

  it('全范围调用 = 旧全文档行为的 inline 子集（heading/bold/task 都在）', () => {
    const doc = '# H1\n\n**b** and - text\n\n- [ ] task\n'
    const state = stateWith(doc, doc.length - 1)
    const specs = collectInlineDecorations(state, 0, doc.length)
    expect(specs.some((s) => s.kind === 'headingLine')).toBe(true)
    expect(specs.some((s) => s.kind === 'bold')).toBe(true)
    expect(specs.some((s) => s.kind === 'task')).toBe(true)
  })
})

describe('collectBlockDecorations — regions', () => {
  it('regions 含 revealed 与非 revealed 的 block 候选区域', () => {
    const doc = '---\nt: 1\n---\n\n```js\nx\n```\n\n| a |\n| - |\n| 1 |\n\n$$\ny\n$$\n\n> [!note] T\n> b\n'
    // 光标放进代码块（revealed）—— 它仍应出现在 regions 里
    const state = stateWith(doc, doc.indexOf('x'))
    const { regions } = collectBlockDecorations(state)
    const fenceFrom = doc.indexOf('```js')
    expect(regions.some((r) => r.from === 0)).toBe(true) // frontmatter
    expect(regions.some((r) => r.from === fenceFrom)).toBe(true) // revealed fence 也在
    expect(regions.some((r) => r.from === doc.indexOf('| a |'))).toBe(true)
    expect(regions.some((r) => r.from === doc.indexOf('$$'))).toBe(true)
    expect(regions.some((r) => r.from === doc.indexOf('> [!note]'))).toBe(true)
  })
})
