import { bench, describe } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations, collectInlineDecorations, collectBlockDecorations } from '@/editor/livePreview/decorationSpecs'

/** 2400 行混合文档：标题/粗斜体/任务/高亮/wiki/代码块/行内数学/图片。 */
function bigDoc(): string {
  const out: string[] = []
  for (let i = 0; i < 200; i++) {
    out.push(
      `# Section ${i}`,
      '',
      `Some **bold ${i}**, *italic*, and \`code\` with a [link](https://example.com/${i}).`,
      '',
      `- [ ] task ${i}`,
      `- item with ==highlight ${i}== and [[Wiki ${i}]]`,
      '',
      '```js',
      `const v${i} = ${i}`,
      '```',
      '',
      `para ${i} with $x_{${i}}^2$ inline math and ![img](pic${i}.png) mention`
    )
  }
  return out.join('\n')
}

const base = EditorState.create({
  doc: bigDoc(),
  extensions: [markdown({ base: markdownLanguage })]
})
// 预热解析缓存：bench 测收集成本，不测首次全文解析
collectDecorations(base)

const anchors = [0, 500, 5000, 20000, base.doc.length - 10]
const states = anchors.map((a) => base.update({ selection: { anchor: a } }).state)

const blockValue = collectBlockDecorations(base)

describe(`livePreview decoration collection — ${base.doc.lines} 行文档`, () => {
  let i = 0
  bench('full-doc collectDecorations（旧：每次光标移动的成本）', () => {
    collectDecorations(states[i++ % states.length])
  })

  let j = 0
  bench('viewport collectInlineDecorations（新：±30 行窗口）', () => {
    const s = states[j++ % states.length]
    const head = s.selection.main.head
    const lineNo = s.doc.lineAt(head).number
    const from = s.doc.line(Math.max(1, lineNo - 30)).from
    const to = s.doc.line(Math.min(s.doc.lines, lineNo + 30)).to
    collectInlineDecorations(s, from, to)
  })

  let k = 0
  bench('block reveal 位图检查（新：prose 内光标移动的 StateField 成本）', () => {
    const s = states[k++ % states.length]
    // 模拟 field 短路路径：只算 revealBits，不重建
    const { regions } = blockValue
    let bits = ''
    for (const r of regions) {
      let hit = false
      for (const range of s.selection.ranges) {
        const lf = s.doc.lineAt(r.from).from
        const lt = s.doc.lineAt(r.to).to
        if (range.to >= lf && range.from <= lt) { hit = true; break }
      }
      bits += hit ? '1' : '0'
    }
    void bits
  })
})
