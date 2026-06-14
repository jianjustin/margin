import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { rangeRevealed } from './reveal'
import { collectFootnoteRefs, findFootnoteDef } from './footnotes'
import { isExternal } from '@/lib/resolvePath'

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
  | 'linkIcon'
  | 'hr'
  | 'task'
  | 'frontmatter'
  | 'codeBlock'
  | 'table'
  | 'properties'
  | 'image'
  | 'footnoteRef'
  | 'wikiLink'

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean
  level?: number
  checked?: boolean
  info?: string
  source?: string
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

  // For markers that live inside a block (fenced code fences, blockquote `>`),
  // reveal should follow the WHOLE block — Typora-style — not just the marker's
  // own line. Walk parents to find a FencedCode or Blockquote container.
  const blockRevealFor = (node: { parent: { name: string; from: number; to: number } | null }):
    | { from: number; to: number }
    | null => {
    let p = node.parent
    while (p) {
      if (p.name === 'FencedCode' || p.name === 'Blockquote') return { from: p.from, to: p.to }
      p = (p as unknown as { parent: typeof p }).parent
    }
    return null
  }

  // Frontmatter: render as an editable properties panel when the cursor is
  // outside the block; reveal raw YAML (muted lines) when inside. Either way the
  // grammar's bogus hr/setext nodes for the region are suppressed by the fmEnd
  // guard in the iterate callback below.
  const fmEnd = frontmatterEnd(state)
  if (fmEnd > 0) {
    if (rangeRevealed(state, 0, fmEnd)) {
      for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n)
        if (line.from >= fmEnd) break
        specs.push({ kind: 'frontmatter', from: line.from, to: line.from, revealed: true })
      }
    } else {
      specs.push({
        kind: 'properties',
        from: 0,
        to: fmEnd,
        revealed: false,
        source: doc.sliceString(0, fmEnd)
      })
    }
  }

  // When a node is replaced by a block widget (fenced code, table), its inner
  // grammar nodes (CodeMark, TableDelimiter, …) must not emit their own
  // decorations — they would overlap the block replacement. Iteration is in
  // document order with children immediately after their parent, so a single
  // forward "skip until" offset suffices (block regions never nest).
  let blockGuardEnd = 0

  tree.iterate({
    enter: (node) => {
      const name = node.name

      // Defensive: never emit decorations for a zero-width node.
      if (node.to <= node.from) return

      // Skip everything the grammar (mis)parsed inside the frontmatter region;
      // it is rendered as muted metadata, not headings/rules. (`return` does not
      // stop descent, so nodes after the region are still visited.)
      if (fmEnd > 0 && node.from < fmEnd) return

      // Skip nodes nested inside an already-emitted block replacement.
      if (node.from < blockGuardEnd) return

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
        const block = blockRevealFor(node.node)
        const revealed = block
          ? rangeRevealed(state, block.from, block.to)
          : rangeRevealed(state, node.from, node.to)
        specs.push({ kind: 'hide', from: node.from, to: node.to, revealed })
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
        const block = blockRevealFor(node.node)
        const revealed = block
          ? rangeRevealed(state, block.from, block.to)
          : rangeRevealed(state, node.from, node.to)
        specs.push({ kind: 'hide', from: node.from, to: node.to, revealed })
        return
      }

      // Fenced code: render as a scrollable highlighted block when the cursor is
      // outside; reveal raw editable lines (cm-code-block) when inside.
      if (name === 'FencedCode') {
        const revealed = rangeRevealed(state, node.from, node.to)
        if (!revealed) {
          const firstLine = doc.lineAt(node.from)
          const info = firstLine.text.replace(/^[`~]+/, '').trim()
          // Strip the opening/closing fence lines for the rendered code body.
          const lines = doc.sliceString(node.from, node.to).split('\n')
          const body = lines.slice(1, lines.length - 1).join('\n')
          specs.push({
            kind: 'codeBlock',
            from: node.from,
            to: node.to,
            revealed: false,
            info,
            source: body
          })
          blockGuardEnd = node.to
          return
        }
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

      // GFM table: render as an editable HTML table when the cursor is outside;
      // reveal raw markdown when inside for complex edits (add/remove rows).
      if (name === 'Table') {
        const revealed = rangeRevealed(state, node.from, node.to)
        if (!revealed) {
          specs.push({
            kind: 'table',
            from: node.from,
            to: node.to,
            revealed: false,
            source: doc.sliceString(node.from, node.to)
          })
          blockGuardEnd = node.to
        }
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
        const revealed = rangeRevealed(state, node.from, node.to)
        // Hide the leading list bullet ("- ") so a task renders as a bare
        // checkbox, not "- ☐". Walk up to the ListItem and swallow everything
        // from its ListMark up to the checkbox.
        let li: typeof node.node | null = node.node.parent
        while (li && li.name !== 'ListItem') li = li.parent
        const mark = li?.getChild('ListMark')
        if (mark && mark.from < node.from) {
          specs.push({ kind: 'hide', from: mark.from, to: node.from, revealed })
        }
        specs.push({
          kind: 'task',
          from: node.from,
          to: node.to,
          revealed,
          checked: /\[[xX]\]/.test(raw)
        })
        return
      }

      // Inline image: replace `![alt](src)` with a rendered <img> when the cursor
      // is outside the node's line; reveal raw source when inside.
      if (name === 'Image') {
        const revealed = rangeRevealed(state, node.from, node.to)
        if (revealed) return // raw text shows; let children render unstyled
        const urlNode = node.node.getChild('URL')
        const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
        let alt = ''
        let firstMark: { to: number } | null = null
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          if (c.name === 'LinkMark') {
            if (!firstMark) { firstMark = c; continue }
            alt = doc.sliceString(firstMark.to, c.from)
            break
          }
        }
        specs.push({ kind: 'image', from: node.from, to: node.to, revealed: false, source: url, info: alt })
        return false // widget replaces the range — skip children
      }

      // Links: style the whole node, hide its [] and (url) children.
      if (name === 'Link') {
        specs.push({ kind: 'link', from: node.from, to: node.to, revealed: false })
        const linkRevealed = rangeRevealed(state, node.from, node.to)
        const url = node.node.getChild('URL')
        if (!linkRevealed && url) {
          const href = doc.sliceString(url.from, url.to)
          specs.push({
            kind: 'linkIcon',
            from: node.from,
            to: node.from,
            revealed: false,
            info: isExternal(href) ? 'external' : 'file'
          })
        }
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

  const fullText = doc.toString()
  const skipAt = (pos: number): boolean => {
    if (fmEnd > 0 && pos < fmEnd) return true
    let n: SyntaxNode | null = tree.resolveInner(pos, 1)
    while (n) {
      if (
        n.name === 'FencedCode' ||
        n.name === 'InlineCode' ||
        n.name === 'CodeText' ||
        n.name === 'Table'
      ) {
        return true
      }
      n = n.parent
    }
    return false
  }
  for (const ref of collectFootnoteRefs(fullText)) {
    if (skipAt(ref.index)) continue
    const from = ref.index
    const to = ref.index + ref.length
    const revealed = rangeRevealed(state, from, to)
    if (!revealed) {
      specs.push({
        kind: 'footnoteRef',
        from,
        to,
        revealed,
        source: ref.label,
        info: findFootnoteDef(fullText, ref.label) ?? ''
      })
    }
  }

  // Wiki links: [[target]] or [[target|display]].
  // Re-uses skipAt() to exclude code blocks, inline code, and tables.
  // Reveal is line-based (consistent with all other live-preview nodes).
  const wikiRe = /\[\[([^\]\n]+)\]\]/g
  for (const m of fullText.matchAll(wikiRe)) {
    const from = m.index ?? 0
    const to = from + m[0].length
    if (skipAt(from)) continue
    const inner = m[1]
    const pipeIdx = inner.indexOf('|')
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).split('#')[0].trim()
    const display = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : target
    const revealed = rangeRevealed(state, from, to)
    specs.push({
      kind: 'wikiLink',
      from,
      to,
      revealed,
      info: target,    // navigation target
      source: display  // display label shown in the widget
    })
  }

  return specs
}
