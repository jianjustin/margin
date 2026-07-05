import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { rangeRevealed, markerRevealed } from './reveal'
import { collectFootnoteRefs, findFootnoteDef } from './footnotes'
import { isExternal } from '@/lib/resolvePath'
import { LIST_INDENT } from '../listContinuation'
import {
  collectHighlightRanges,
  collectMathRanges,
  collectMathBlockSpans,
  diagramKindForInfo,
  parseCallout,
  parseImageMeta
} from './richContent'

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
  | 'diagramBlock'
  | 'table'
  | 'properties'
  | 'image'
  | 'media'
  | 'footnoteRef'
  | 'wikiLink'
  | 'mathInline'
  | 'mathBlock'
  | 'callout'
  | 'highlight'
  | 'listBullet'
  | 'listNumber'
  | 'taskDoneText'

export interface DecoSpec {
  kind: DecoKind
  from: number
  to: number
  revealed: boolean
  level?: number
  checked?: boolean
  info?: string
  source?: string
  width?: number
  height?: number
  title?: string
  folded?: boolean
  placement?: 'block' | 'inline'
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

export interface BlockRegion {
  from: number
  to: number
}

function makeSkipAt(tree: ReturnType<typeof syntaxTree>, fmEnd: number): (pos: number) => boolean {
  return (pos: number): boolean => {
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
}

/** Image/media 节点 → spec。block/inline 收集器共用，保证 standalone 图片两边产出一致。 */
function imageSpecFor(state: EditorState, node: SyntaxNode): DecoSpec {
  const doc = state.doc
  const urlNode = node.getChild('URL')
  const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
  let alt = ''
  let firstMark: { to: number } | null = null
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') {
      if (!firstMark) {
        firstMark = c
        continue
      }
      alt = doc.sliceString(firstMark.to, c.from)
      break
    }
  }
  const meta = parseImageMeta(alt, url)
  const line = doc.lineAt(node.from)
  const standalone = line.text.trim() === doc.sliceString(node.from, node.to)
  return {
    kind: meta.mediaKind ? 'media' : 'image',
    from: node.from,
    to: node.to,
    revealed: rangeRevealed(state, node.from, node.to),
    placement: standalone ? 'block' : 'inline',
    source: meta.url,
    info: meta.alt,
    title: meta.alt,
    width: meta.width,
    height: meta.height
  }
}

/**
 * Block 级 decoration 收集：全文档遍历，但只处理会产生 block widget/行装饰的
 * 节点。`regions` 是无论 reveal 与否的 block 候选区域，StateField 用它做
 * 「选择变化是否翻转了某个 block 的 reveal」的短路判断。
 */
export function collectBlockDecorations(state: EditorState): {
  specs: DecoSpec[]
  regions: BlockRegion[]
} {
  const specs: DecoSpec[] = []
  const regions: BlockRegion[] = []
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state)
  const doc = state.doc

  const fmEnd = frontmatterEnd(state)
  if (fmEnd > 0) {
    regions.push({ from: 0, to: fmEnd })
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

  let blockGuardEnd = 0

  tree.iterate({
    enter: (node) => {
      const name = node.name
      if (node.to <= node.from) return
      if (fmEnd > 0 && node.from < fmEnd) return
      if (node.from < blockGuardEnd) return

      if (name === 'FencedCode') {
        regions.push({ from: node.from, to: node.to })
        if (!rangeRevealed(state, node.from, node.to)) {
          const firstLine = doc.lineAt(node.from)
          const info = firstLine.text.replace(/^[`~]+/, '').trim()
          const lines = doc.sliceString(node.from, node.to).split('\n')
          const body = lines.slice(1, lines.length - 1).join('\n')
          const diagramKind = diagramKindForInfo(info)
          specs.push({
            kind: diagramKind ? 'diagramBlock' : 'codeBlock',
            from: node.from,
            to: node.to,
            revealed: false,
            info: diagramKind ?? info,
            source: body
          })
          blockGuardEnd = node.to
        } else {
          for (const s of eachLine(state, node.from, node.to, (lineFrom) => ({
            kind: 'codeLine',
            from: lineFrom,
            to: lineFrom,
            revealed: false
          }))) {
            specs.push(s)
          }
        }
        return false
      }

      if (name === 'Table') {
        regions.push({ from: node.from, to: node.to })
        if (!rangeRevealed(state, node.from, node.to)) {
          specs.push({
            kind: 'table',
            from: node.from,
            to: node.to,
            revealed: false,
            source: doc.sliceString(node.from, node.to)
          })
          blockGuardEnd = node.to
        }
        return false
      }

      if (name === 'Blockquote') {
        const callout = parseCallout(doc.sliceString(node.from, node.to))
        if (callout) {
          regions.push({ from: node.from, to: node.to })
          if (!rangeRevealed(state, node.from, node.to)) {
            specs.push({
              kind: 'callout',
              from: node.from,
              to: node.to,
              revealed: false,
              info: callout.type,
              title: callout.title,
              folded: callout.folded,
              source: callout.body
            })
            blockGuardEnd = node.to
            return false
          }
        }
        return // revealed/普通引用可能内嵌 FencedCode，继续下钻
      }

      if (name === 'Image') {
        const spec = imageSpecFor(state, node.node)
        if (spec.placement === 'block') specs.push(spec)
        return false
      }
      return
    }
  })

  const skipAt = makeSkipAt(tree, fmEnd)
  const mathEnabledSpans = collectMathBlockSpans(state, skipAt)
  for (const span of mathEnabledSpans) {
    regions.push({ from: span.from, to: span.to })
    if (!rangeRevealed(state, span.from, span.to)) {
      const openLine = doc.lineAt(span.from)
      const closeLine = doc.lineAt(span.to)
      specs.push({
        kind: 'mathBlock',
        from: span.from,
        to: span.to,
        revealed: false,
        source: doc.sliceString(openLine.to + 1, closeLine.from).trim()
      })
    }
  }

  return { specs, regions }
}

/**
 * Inline 级 decoration 收集：只处理与 [rangeFrom, rangeTo]（扩展到整行）相交
 * 的内容。隐藏 block（fence/table/callout）的子树直接剪枝 —— 它们由 block 层
 * 的 widget 整体替换。
 */
export function collectInlineDecorations(
  state: EditorState,
  rangeFrom: number,
  rangeTo: number
): DecoSpec[] {
  const specs: DecoSpec[] = []
  const doc = state.doc
  const tree = ensureSyntaxTree(state, Math.min(Math.max(rangeTo, 0), doc.length), 5000) ?? syntaxTree(state)
  const from = doc.lineAt(Math.max(0, Math.min(rangeFrom, doc.length))).from
  const to = doc.lineAt(Math.max(0, Math.min(rangeTo, doc.length))).to
  const fmEnd = frontmatterEnd(state)

  const pushHide = (hFrom: number, hTo: number): void => {
    specs.push({ kind: 'hide', from: hFrom, to: hTo, revealed: rangeRevealed(state, hFrom, hTo) })
  }

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

  tree.iterate({
    from,
    to,
    enter: (node) => {
      const name = node.name
      if (node.to <= node.from) return
      if (fmEnd > 0 && node.from < fmEnd) return

      // 隐藏的 block 容器：整棵子树剪枝（由 StateField 的 block widget 替换）
      if (name === 'FencedCode' || name === 'Table') {
        if (!rangeRevealed(state, node.from, node.to)) return false
        return // revealed：下钻让 CodeMark/CodeInfo 正常产出
      }
      if (name === 'Blockquote') {
        const callout = parseCallout(doc.sliceString(node.from, node.to))
        if (callout && !rangeRevealed(state, node.from, node.to)) return false
        for (const s of eachLine(
          state,
          Math.max(node.from, from),
          Math.min(node.to, to),
          (lineFrom) => ({ kind: 'quoteLine', from: lineFrom, to: lineFrom, revealed: false })
        )) {
          specs.push(s)
        }
        return
      }

      // ↓↓↓ 以下分支从原 collectDecorations 的 iterate 回调逐字搬移，逻辑不变 ↓↓↓
      // Headings: ATXHeading1..6
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = Number(name.slice(-1))
        const line = doc.lineAt(node.from)
        specs.push({ kind: 'headingLine', from: line.from, to: line.from, revealed: false, level })
        return
      }
      if (name === 'HeaderMark') {
        // also swallow the single space after the leading '#'s
        let hTo = node.to
        if (doc.sliceString(hTo, hTo + 1) === ' ') hTo += 1
        pushHide(node.from, hTo)
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

      if (name === 'QuoteMark') {
        const block = blockRevealFor(node.node)
        const revealed = block
          ? rangeRevealed(state, block.from, block.to)
          : rangeRevealed(state, node.from, node.to)
        specs.push({ kind: 'hide', from: node.from, to: node.to, revealed })
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

      // List item: hide the raw ListMark (-, *, +, 1.) and show a bullet/number
      // widget when the cursor is outside the line; reveal raw source when inside.
      if (name === 'ListItem') {
        const taskMarker = node.node.getChild('TaskMarker')
        if (taskMarker) return // TaskMarker handler below hides the mark + shows checkbox

        const mark = node.node.getChild('ListMark')
        if (!mark) return

        const markRaw = doc.sliceString(mark.from, mark.to)
        const isOrdered = /^\d+\./.test(markRaw.trimStart())
        const num = isOrdered ? parseInt(markRaw.trimStart(), 10) : undefined
        const revealed = rangeRevealed(state, node.from, node.to)

        // Hide the raw ListMark text (e.g. "- ", "1. ")
        specs.push({ kind: 'hide', from: mark.from, to: mark.to, revealed })

        if (!revealed) {
          const line = doc.lineAt(node.from)
          const indentLevel = Math.floor((mark.from - line.from) / LIST_INDENT)
          specs.push({
            kind: isOrdered ? 'listNumber' : 'listBullet',
            from: mark.from,
            to: mark.to,
            revealed: false,
            info: isOrdered ? String(num) : undefined,
            level: indentLevel
          })
        }
        return
      }

      // Task checkbox — marker-level reveal: only flips to source when the cursor
      // actually touches "- [ ]"; elsewhere on the line the checkbox stays rendered.
      if (name === 'TaskMarker') {
        const raw = doc.sliceString(node.from, node.to)
        let li: typeof node.node | null = node.node.parent
        while (li && li.name !== 'ListItem') li = li.parent
        const mark = li?.getChild('ListMark')
        const hideFrom = mark && mark.from < node.from ? mark.from : node.from
        const revealed = markerRevealed(state, hideFrom, node.to)
        if (mark && mark.from < node.from) {
          specs.push({ kind: 'hide', from: mark.from, to: node.from, revealed })
        }
        const checked = /\[[xX]\]/.test(raw)
        specs.push({ kind: 'task', from: node.from, to: node.to, revealed, checked })
        if (checked) {
          const line = doc.lineAt(node.from)
          if (node.to + 1 < line.to) {
            specs.push({ kind: 'taskDoneText', from: node.to + 1, to: line.to, revealed })
          }
        }
        return
      }

      if (name === 'Image') {
        specs.push(imageSpecFor(state, node.node))
        return false
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

  // 正则类收集：只扫范围切片，命中位置加 `from` 偏移
  const skipAt = makeSkipAt(tree, fmEnd)
  const scanText = doc.sliceString(from, to)
  let cachedFullText: string | null = null
  const fullText = (): string => (cachedFullText ??= doc.toString())

  for (const ref of collectFootnoteRefs(scanText)) {
    const refFrom = from + ref.index
    const refTo = refFrom + ref.length
    if (skipAt(refFrom)) continue
    const revealed = rangeRevealed(state, refFrom, refTo)
    if (!revealed) {
      specs.push({
        kind: 'footnoteRef',
        from: refFrom,
        to: refTo,
        revealed,
        source: ref.label,
        // 脚注定义可能在 viewport 外（通常在文末），懒取全文
        info: findFootnoteDef(fullText(), ref.label) ?? ''
      })
    }
  }

  const imageRe = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g
  for (const match of scanText.matchAll(imageRe)) {
    const mFrom = from + (match.index ?? 0)
    const mTo = mFrom + match[0].length
    if (skipAt(mFrom) || rangeRevealed(state, mFrom, mTo)) continue
    if (
      specs.some(
        (spec) => (spec.kind === 'image' || spec.kind === 'media') && spec.from === mFrom && spec.to === mTo
      )
    ) {
      continue
    }
    const meta = parseImageMeta(match[1], match[2])
    specs.push({
      kind: meta.mediaKind ? 'media' : 'image',
      from: mFrom,
      to: mTo,
      revealed: false,
      source: meta.url,
      info: meta.alt,
      title: meta.alt,
      width: meta.width,
      height: meta.height
    })
  }

  for (const math of collectMathRanges(state, tree, skipAt, from, to)) {
    if (math.block) continue
    specs.push({ kind: 'mathInline', from: math.from, to: math.to, revealed: false, source: math.source })
  }

  for (const highlight of collectHighlightRanges(state, tree, skipAt, from, to)) {
    specs.push({ kind: 'hide', from: highlight.markerFrom, to: highlight.markerFrom + 2, revealed: false })
    specs.push({ kind: 'highlight', from: highlight.from, to: highlight.to, revealed: false })
    specs.push({ kind: 'hide', from: highlight.markerTo - 2, to: highlight.markerTo, revealed: false })
  }

  const wikiRe = /\[\[([^\]\n]+)\]\]/g
  for (const m of scanText.matchAll(wikiRe)) {
    const wFrom = from + (m.index ?? 0)
    const wTo = wFrom + m[0].length
    if (skipAt(wFrom)) continue
    const inner = m[1]
    const pipeIdx = inner.indexOf('|')
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).split('#')[0].trim()
    const display = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : target
    const revealed = rangeRevealed(state, wFrom, wTo)
    specs.push({ kind: 'wikiLink', from: wFrom, to: wTo, revealed, info: target, source: display })
  }

  return specs
}

/** 兼容包装：全文档 block + inline。standalone 图片会重复产出一条（两层各一），调用方按 kind/placement 各取所需。 */
export function collectDecorations(state: EditorState): DecoSpec[] {
  return [
    ...collectBlockDecorations(state).specs,
    ...collectInlineDecorations(state, 0, state.doc.length)
  ]
}
