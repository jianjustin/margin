import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { collectDecorations } from './decorationSpecs'
import {
  CheckboxWidget,
  HrWidget,
  CodeBlockWidget,
  TableWidget,
  PropertiesWidget
} from './widgets'

const hideMark = Decoration.replace({})
const boldMark = Decoration.mark({ class: 'cm-strong' })
const italicMark = Decoration.mark({ class: 'cm-em' })
const strikeMark = Decoration.mark({ class: 'cm-strike' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code' })
const linkMark = Decoration.mark({ class: 'cm-link' })
const quoteLine = Decoration.line({ class: 'cm-blockquote' })
const codeLine = Decoration.line({ class: 'cm-code-block' })
const frontmatterLine = Decoration.line({ class: 'cm-frontmatter' })

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
      case 'frontmatter':
        ranges.push(frontmatterLine.range(s.from))
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
      case 'codeBlock':
        ranges.push(
          Decoration.replace({
            widget: new CodeBlockWidget(s.source ?? '', s.info ?? ''),
            block: true
          }).range(s.from, s.to)
        )
        break
      case 'table':
        ranges.push(
          Decoration.replace({
            widget: new TableWidget(s.source ?? '', s.from, s.to),
            block: true
          }).range(s.from, s.to)
        )
        break
      case 'properties':
        ranges.push(
          Decoration.replace({
            widget: new PropertiesWidget(s.source ?? '', s.from, s.to),
            block: true
          }).range(s.from, s.to)
        )
        break
    }
  }

  // sort=true lets CodeMirror order the mixed point/range decorations correctly.
  return Decoration.set(ranges, true)
}

/**
 * The live-preview decoration layer. Implemented as a StateField (not a
 * ViewPlugin) because block-level replacing decorations that cross line breaks
 * — our fenced-code / table / properties widgets — may only be provided through
 * the editor state, not a plugin. Rebuilds whenever the document or selection
 * changes (selection drives Typora-style cursor reveal).
 */
export const livePreview = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state)
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state)
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})
