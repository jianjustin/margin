// @vitest-environment jsdom
//
// Performance benchmark for the interaction hot path.
//
// This is NOT a pass/fail unit test — it measures the per-keystroke and
// per-cursor-move cost of the live-preview decoration layer at several document
// sizes and prints a table. It exists to (a) quantify the reported "interaction
// latency is high" symptom and (b) prove a fix actually moved the numbers.
//
// Run with:  npx vitest run test/perf/livePreview.bench.test.ts
import { describe, it, afterEach } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

/** One realistic markdown "section" — a mix of every rich block we decorate. */
const SECTION = [
  '## Section heading with some length to it',
  '',
  'A paragraph with **bold**, *italic*, ~~strike~~, `inline code`, and a',
  '[link](https://example.com/some/path) plus more trailing prose so the line',
  'wraps and the inline parser has real work to do on every keystroke.',
  '',
  '> A blockquote line that the grammar must walk.',
  '',
  '- [ ] a pending task item',
  '- [x] a completed task item',
  '- a plain bullet with `code` inside',
  '',
  '```ts',
  'function example(n: number): number {',
  '  return n * 2 + 1',
  '}',
  '```',
  '',
  '| col a | col b | col c |',
  '| ----- | ----- | ----- |',
  '| 1     | 2     | 3     |',
  '',
  'Closing paragraph of the section with a bit more text to pad the size.',
  ''
].join('\n')

function docOfSections(n: number): string {
  const fm = ['---', 'title: Benchmark doc', 'tags: perf, bench', '---', '', ''].join('\n')
  return fm + Array.from({ length: n }, () => SECTION).join('\n')
}

/** Median of timing `fn` `runs` times, in milliseconds. */
function medianMs(runs: number, fn: () => void): number {
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

let view: EditorView | null = null
afterEach(() => {
  view?.destroy()
  view = null
})

function mount(doc: string, anchor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview]
  })
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({ state, parent })
}

describe('live-preview interaction latency', () => {
  const SIZES = [
    { sections: 5, label: 'small (~5 sections)' },
    { sections: 40, label: 'medium (~40 sections)' },
    { sections: 150, label: 'large (~150 sections)' }
  ]

  it('measures decoration rebuild, keystroke, and cursor-move cost by size', () => {
    const rows: string[] = []
    rows.push(
      ['size', 'lines', 'chars', 'collectDeco', 'keystroke', 'move(cross-line)', 'move(same-line)']
        .map((s) => s.padEnd(20))
        .join('')
    )

    for (const { sections, label } of SIZES) {
      const doc = docOfSections(sections)
      const lines = doc.split('\n').length
      // Cursor parked in body prose, away from rich blocks, like normal typing.
      const anchor = Math.floor(doc.length / 2)

      // (1) Pure collectDecorations cost (the StateField's per-update work).
      const collectState = EditorState.create({
        doc,
        selection: { anchor },
        extensions: [markdown({ base: markdownLanguage })]
      })
      const collectMs = medianMs(15, () => collectDecorations(collectState))

      // (2) Full keystroke: dispatch a single-char insert into a live view.
      view = mount(doc, anchor)
      let pos = anchor
      const keystrokeMs = medianMs(15, () => {
        view!.dispatch({
          changes: { from: pos, insert: 'x' },
          selection: { anchor: pos + 1 }
        })
        pos += 1
      })
      view.destroy()

      // (3a) Cursor move across lines (no doc change) — changes reveal, rebuilds.
      view = mount(doc, anchor)
      const positions = [anchor, anchor + 30, anchor - 30, anchor + 60, anchor - 60]
      let i = 0
      const crossLineMs = medianMs(15, () => {
        const p = Math.max(0, Math.min(doc.length, positions[i++ % positions.length]))
        view!.dispatch({ selection: EditorSelection.single(p) })
      })
      view.destroy()

      // (3b) Cursor move within the same line (left/right arrow) — reveal is
      // unchanged, so the decoration set should be reused (Fix 2).
      view = mount(doc, anchor)
      let j = 0
      const sameLineMs = medianMs(15, () => {
        const p = anchor + (j++ % 2) // toggle between anchor and anchor+1
        view!.dispatch({ selection: EditorSelection.single(p) })
      })
      view.destroy()
      view = null

      rows.push(
        [
          label,
          String(lines),
          String(doc.length),
          collectMs.toFixed(2) + ' ms',
          keystrokeMs.toFixed(2) + ' ms',
          crossLineMs.toFixed(2) + ' ms',
          sameLineMs.toFixed(3) + ' ms'
        ]
          .map((s) => s.padEnd(20))
          .join('')
      )
    }

    // eslint-disable-next-line no-console
    console.log('\n' + rows.join('\n') + '\n')
  })
})
