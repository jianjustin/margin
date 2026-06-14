import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'

/** URL of the markdown Link or `wiki:<target>` of the wiki link containing `pos`. */
export function linkUrlAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 0)
  while (node && node.name !== 'Link') node = node.parent
  if (node) {
    const url = node.getChild('URL')
    if (url) return state.doc.sliceString(url.from, url.to)
  }

  const line = state.doc.lineAt(pos)
  const offset = pos - line.from
  const wiki = /\[\[([^\]\n]+)\]\]/g
  for (const match of line.text.matchAll(wiki)) {
    const from = match.index ?? 0
    const to = from + match[0].length
    if (offset >= from && offset <= to) return `wiki:${match[1]}`
  }
  return null
}
