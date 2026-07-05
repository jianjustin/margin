// test/livePreviewInlineViewport.test.ts
// Node 环境，纯 state — 验证 buildInlineDecorations 的 viewport 语义锁定。
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { buildInlineDecorations } from '@/editor/livePreview/livePreviewPlugin'

function manyParas(n: number): string {
  return Array.from({ length: n }, (_, i) => `para ${i} with **bold ${i}**`).join('\n\n')
}

function stateWith(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

describe('buildInlineDecorations — viewport 限定语义', () => {
  const doc = manyParas(100)
  // para N 在行 2N+1（每段中间有空行）；line() 是 1-based
  // 对应文档行索引：para 40 → 行 81，para 50 → 行 101，para 90 → 行 181
  const state = stateWith(doc, 0)

  const l40 = state.doc.line(81)  // para 40
  const l50 = state.doc.line(101) // para 50
  const l90 = state.doc.line(181) // para 90

  // 找出 bold 90 的位置
  const bold90Text = '**bold 90**'
  const bold90Abs = doc.indexOf(bold90Text)
  const bold90From = bold90Abs + 2  // 跳过 **
  const bold90To = bold90Abs + bold90Text.length - 2  // 跳过尾部 **

  // 找出 bold 45 的位置
  const bold45Text = '**bold 45**'
  const bold45Abs = doc.indexOf(bold45Text)

  it('viewport 内的 bold 45 有 mark decoration', () => {
    const { deco } = buildInlineDecorations(state, { from: l40.from, to: l50.to })
    const found: boolean[] = []
    deco.between(bold45Abs, bold45Abs + bold45Text.length, () => { found.push(true) })
    expect(found.length).toBeGreaterThan(0)
  })

  it('viewport 外的 bold 90 不存在 decoration', () => {
    const { deco } = buildInlineDecorations(state, { from: l40.from, to: l50.to })
    const found: boolean[] = []
    deco.between(bold90From, bold90To, () => { found.push(true) })
    expect(found).toHaveLength(0)
  })

  it('atomic 集合在 viewport 外 bold 90 附近为空', () => {
    const { atomic } = buildInlineDecorations(state, { from: l40.from, to: l50.to })
    const found: boolean[] = []
    // bold 90 的 ** markers 所在位置也在 l90 行
    atomic.between(l90.from, l90.to, () => { found.push(true) })
    expect(found).toHaveLength(0)
  })

  it('扩大 viewport 至包含 bold 90 时，decoration 出现', () => {
    const { deco } = buildInlineDecorations(state, { from: l40.from, to: l90.to })
    const found: boolean[] = []
    deco.between(bold90From, bold90To, () => { found.push(true) })
    expect(found.length).toBeGreaterThan(0)
  })
})
