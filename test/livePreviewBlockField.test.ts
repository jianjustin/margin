import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview, livePreviewBlock } from '@/editor/livePreview/livePreviewPlugin'

const DOC = 'para one\npara two\n\n```js\ncode line\n```\n\ntail para\n'

function create(anchor: number): EditorState {
  return EditorState.create({
    doc: DOC,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview]
  })
}

describe('livePreviewBlock — 选择变化短路', () => {
  it('prose 内移动光标：field 值引用复用', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)
    const s1 = s0.update({ selection: { anchor: 3 } }).state
    expect(s1.field(livePreviewBlock)).toBe(v0)
    const s2 = s1.update({ selection: { anchor: DOC.indexOf('tail') } }).state
    expect(s2.field(livePreviewBlock)).toBe(v0)
  })

  it('光标进入代码块：重建且 widget 消失；离开后 widget 回来', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)

    const inside = s0.update({ selection: { anchor: DOC.indexOf('code line') } }).state
    const vIn = inside.field(livePreviewBlock)
    expect(vIn).not.toBe(v0)
    let widgetInside = false
    vIn.deco.between(0, DOC.length, (_f, _t, d) => {
      if ((d as unknown as { spec: { block?: boolean; widget?: unknown } }).spec.widget) widgetInside = true
    })
    expect(widgetInside).toBe(false)

    const back = inside.update({ selection: { anchor: 0 } }).state
    const vBack = back.field(livePreviewBlock)
    expect(vBack).not.toBe(vIn)
    let widgetBack = false
    vBack.deco.between(0, DOC.length, (_f, _t, d) => {
      if ((d as unknown as { spec: { block?: boolean; widget?: unknown } }).spec.widget) widgetBack = true
    })
    expect(widgetBack).toBe(true)
  })

  it('文档变化总是重建', () => {
    const s0 = create(0)
    const v0 = s0.field(livePreviewBlock)
    const s1 = s0.update({ changes: { from: 0, insert: 'x' } }).state
    expect(s1.field(livePreviewBlock)).not.toBe(v0)
  })
})
