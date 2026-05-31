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

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean
  level?: number
  checked?: boolean
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

  tree.iterate({
    enter: (node) => {
      const name = node.name

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
    }
  })

  return specs
}
