import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import type { EditorState, Range } from '@codemirror/state'
import { collectDecorations } from './decorationSpecs'
import { CheckboxWidget, HrWidget } from './widgets'

const hideMark = Decoration.replace({})
const boldMark = Decoration.mark({ class: 'cm-strong' })
const italicMark = Decoration.mark({ class: 'cm-em' })
const strikeMark = Decoration.mark({ class: 'cm-strike' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code' })
const linkMark = Decoration.mark({ class: 'cm-link' })
const quoteLine = Decoration.line({ class: 'cm-blockquote' })
const codeLine = Decoration.line({ class: 'cm-code-block' })

function buildDecorations(state: EditorState): DecorationSet {
  const specs = collectDecorations(state)
  const ranges: Range<Decoration>[] = []

  for (const s of specs) {
    switch (s.kind) {
      case 'hide':
        if (!s.revealed && s.to > s.from) ranges.push(hideMark.range(s.from, s.to))
        break
      case 'headingLine':
        ranges.push(Decoration.line({ class: `cm-heading cm-h${s.level ?? 1}` }).range(s.from))
        break
      case 'bold':
        ranges.push(boldMark.range(s.from, s.to))
        break
      case 'italic':
        ranges.push(italicMark.range(s.from, s.to))
        break
      case 'strike':
        ranges.push(strikeMark.range(s.from, s.to))
        break
      case 'inlineCode':
        ranges.push(inlineCodeMark.range(s.from, s.to))
        break
      case 'link':
        ranges.push(linkMark.range(s.from, s.to))
        break
      case 'quoteLine':
        ranges.push(quoteLine.range(s.from))
        break
      case 'codeLine':
        ranges.push(codeLine.range(s.from))
        break
      case 'hr':
        if (!s.revealed) {
          ranges.push(Decoration.replace({ widget: new HrWidget(), block: false }).range(s.from, s.to))
        }
        break
      case 'task':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({ widget: new CheckboxWidget(s.checked ?? false) }).range(s.from, s.to)
          )
        }
        break
    }
  }

  // sort=true lets CodeMirror order the mixed point/range decorations correctly.
  return Decoration.set(ranges, true)
}

/** The live-preview decoration layer: rebuilds on doc/selection/viewport change. */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)
