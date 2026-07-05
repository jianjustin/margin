import { bench, describe } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

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

describe(`livePreview decoration collection — ${base.doc.lines} 行文档`, () => {
  let i = 0
  bench('full-doc collectDecorations（旧：每次光标移动的成本）', () => {
    collectDecorations(states[i++ % states.length])
  })
})
