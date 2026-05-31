import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { rangeRevealed } from './reveal'

export type DecoKind =
  | 'hide'
  | 'headingLine'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'quoteLine'
  | 'codeLine'
  | 'link'
  | 'hr'
  | 'task'
  | 'frontmatter'

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean
  level?: number
  checked?: boolean
}

/**
 * If the document opens with a YAML frontmatter block (`---` on line 1, closed
 * by a later `---` line), return the offset where that block ends; otherwise 0.
 *
 * The markdown grammar has no frontmatter rule — it mis-parses the opening
 * `---` as a HorizontalRule and the keys + closing `---` as a SetextHeading.
 * We detect the region by plain text scan so the collector can suppress those
 * bogus decorations and style the block as muted metadata instead.
 */
export function frontmatterEnd(state: EditorState): number {
  const doc = state.doc
  if (doc.lines < 2 || doc.line(1).text !== '---') return 0
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (line.text === '---') return line.to
  }
  return 0 // no closing fence — not frontmatter
}

/** Push a point spec at the start of every line in [from, to]. */
function eachLine(
  state: EditorState,
  from: number,
  to: number,
  make: (lineFrom: number) => DecoSpec
): DecoSpec[] {
  const out: DecoSpec[] = []
  let pos = from
  while (pos <= to) {
    const line = state.doc.lineAt(pos)
    // Defensive: skip a trailing line that begins exactly at `to` (zero overlap
    // with the block), unless the block is itself empty (from === to). With the
    // current grammar a block's `to` lands on the end of its last content line,
    // so this never triggers today — it guards against future/edge nodes.
    if (line.from >= to && to > from) break
    out.push(make(line.from))
    if (line.to >= to) break
    pos = line.to + 1
  }
  return out
}

/**
 * Walk the markdown syntax tree of `state` and emit a flat list of decoration
 * specs. Pure: depends only on the document text, syntax tree, and selection.
 * Never mutates the document.
 */
export function collectDecorations(state: EditorState): DecoSpec[] {
  const specs: DecoSpec[] = []
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state)
  const doc = state.doc

  const pushHide = (from: number, to: number): void => {
    specs.push({ kind: 'hide', from, to, revealed: rangeRevealed(state, from, to) })
  }

  // Frontmatter: style each line muted, and suppress the bogus hr/setext
  // decorations the grammar produces for the region (suppressed in the iterate
  // guard below).
  const fmEnd = frontmatterEnd(state)
  if (fmEnd > 0) {
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n)
      if (line.from >= fmEnd) break
      specs.push({ kind: 'frontmatter', from: line.from, to: line.from, revealed: false })
    }
  }

  tree.iterate({
    enter: (node) => {
      const name = node.name

      // Defensive: never emit decorations for a zero-width node.
      if (node.to <= node.from) return

      // Skip everything the grammar (mis)parsed inside the frontmatter region;
      // it is rendered as muted metadata, not headings/rules. (`return` does not
      // stop descent, so nodes after the region are still visited.)
      if (fmEnd > 0 && node.from < fmEnd) return

      // Headings: ATXHeading1..6
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = Number(name.slice(-1))
        const line = doc.lineAt(node.from)
        specs.push({ kind: 'headingLine', from: line.from, to: line.from, revealed: false, level })
        return
      }
      if (name === 'HeaderMark') {
        // also swallow the single space after the leading '#'s
        let to = node.to
        if (doc.sliceString(to, to + 1) === ' ') to += 1
        pushHide(node.from, to)
        return
      }

      // Inline emphasis
      if (name === 'StrongEmphasis') {
        specs.push({ kind: 'bold', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'Emphasis') {
        specs.push({ kind: 'italic', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'Strikethrough') {
        specs.push({ kind: 'strike', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
        pushHide(node.from, node.to)
        return
      }

      // Inline code
      if (name === 'InlineCode') {
        specs.push({ kind: 'inlineCode', from: node.from, to: node.to, revealed: false })
        return
      }
      if (name === 'CodeMark') {
        pushHide(node.from, node.to)
        return
      }

      // Blockquote
      if (name === 'Blockquote') {
        for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
          kind: 'quoteLine',
          from: lineFrom,
          to: lineFrom,
          revealed: false
        }))) {
          specs.push(s)
        }
        return
      }
      if (name === 'QuoteMark') {
        pushHide(node.from, node.to)
        return
      }

      // Fenced code
      if (name === 'FencedCode') {
        for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
          kind: 'codeLine',
          from: lineFrom,
          to: lineFrom,
          revealed: false
        }))) {
          specs.push(s)
        }
        return
      }
      if (name === 'CodeInfo') {
        pushHide(node.from, node.to)
        return
      }

      // Horizontal rule
      if (name === 'HorizontalRule') {
        const line = doc.lineAt(node.from)
        specs.push({
          kind: 'hr',
          from: line.from,
          to: line.to,
          revealed: rangeRevealed(state, line.from, line.to)
        })
        return
      }

      // Task checkbox
      if (name === 'TaskMarker') {
        const raw = doc.sliceString(node.from, node.to)
        specs.push({
          kind: 'task',
          from: node.from,
          to: node.to,
          revealed: rangeRevealed(state, node.from, node.to),
          checked: /\[[xX]\]/.test(raw)
        })
        return
      }

      // Links: style the whole node, hide its [] and (url) children.
      // (Images are a separate `Image` node and are intentionally left untouched.)
      if (name === 'Link') {
        specs.push({ kind: 'link', from: node.from, to: node.to, revealed: false })
        const linkRevealed = rangeRevealed(state, node.from, node.to)
        let child = node.node.firstChild
        while (child) {
          if (child.name === 'LinkMark' || child.name === 'URL') {
            specs.push({ kind: 'hide', from: child.from, to: child.to, revealed: linkRevealed })
          }
          child = child.nextSibling
        }
        return
      }
    }
  })

  return specs
}
