import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { collectDecorations } from './decorationSpecs'
import {
  CheckboxWidget,
  HrWidget,
  CodeBlockWidget,
  DiagramWidget,
  TableWidget,
  PropertiesWidget,
  ImageWidget,
  MediaWidget,
  FootnoteWidget,
  LinkIconWidget,
  WikiLinkWidget,
  MathWidget,
  CalloutWidget,
  BulletWidget
} from './widgets'
import { docPathFacet, vaultRootFacet } from '../docPathFacet'
import { isExternal, resolveMarkdownAsset } from '@/lib/resolvePath'
import { richContentConfigFacet } from './richContent'

const hideMark = Decoration.replace({})
const boldMark = Decoration.mark({ class: 'cm-strong' })
const italicMark = Decoration.mark({ class: 'cm-em' })
const strikeMark = Decoration.mark({ class: 'cm-strike' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code' })
const linkMark = Decoration.mark({ class: 'cm-link' })
const highlightMark = Decoration.mark({ class: 'cm-highlight' })
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
      case 'highlight':
        ranges.push(highlightMark.range(s.from, s.to))
        break
      case 'linkIcon':
        ranges.push(
          Decoration.widget({
            widget: new LinkIconWidget(s.info === 'external' ? 'external' : 'file'),
            side: -1
          }).range(s.from)
        )
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
            Decoration.replace({ widget: new CheckboxWidget(s.checked ?? false, s.from, s.to) }).range(s.from, s.to)
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
      case 'diagramBlock': {
        const cfg = state.facet(richContentConfigFacet)
        ranges.push(
          Decoration.replace({
            widget: new DiagramWidget(s.source ?? '', s.info ?? 'mermaid', cfg.plantUmlServerUrl, cfg.diagramFitWidth),
            block: true
          }).range(s.from, s.to)
        )
        break
      }
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
      case 'image': {
        const src = s.source ?? ''
        const dp = state.facet(docPathFacet)
        const root = state.facet(vaultRootFacet)
        const cfg = state.facet(richContentConfigFacet)
        const resolved = isExternal(src) ? src : resolveMarkdownAsset(src, dp, root, cfg.assetsDir)
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(src, s.info ?? '', resolved, s.width, s.height),
            block: true
          }).range(s.from, s.to)
        )
        break
      }
      case 'media': {
        const src = s.source ?? ''
        const dp = state.facet(docPathFacet)
        const root = state.facet(vaultRootFacet)
        const cfg = state.facet(richContentConfigFacet)
        const resolved = isExternal(src) ? src : resolveMarkdownAsset(src, dp, root, cfg.assetsDir)
        ranges.push(
          Decoration.replace({
            widget: new MediaWidget(src, s.info ?? '', resolved, s.width, s.height),
            block: true
          }).range(s.from, s.to)
        )
        break
      }
      case 'footnoteRef':
        ranges.push(
          Decoration.replace({
            widget: new FootnoteWidget(s.source ?? '', s.info ?? '')
          }).range(s.from, s.to)
        )
        break
      case 'wikiLink':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({
              widget: new WikiLinkWidget(s.info ?? '', s.source ?? s.info ?? '')
            }).range(s.from, s.to)
          )
        }
        break
      case 'mathInline': {
        const cfg = state.facet(richContentConfigFacet)
        if (cfg.mathEnabled) {
          ranges.push(
            Decoration.replace({ widget: new MathWidget(s.source ?? '', false) }).range(s.from, s.to)
          )
        }
        break
      }
      case 'mathBlock': {
        const cfg = state.facet(richContentConfigFacet)
        if (cfg.mathEnabled) {
          ranges.push(
            Decoration.replace({ widget: new MathWidget(s.source ?? '', true), block: true }).range(s.from, s.to)
          )
        }
        break
      }
      case 'callout':
        ranges.push(
          Decoration.replace({
            widget: new CalloutWidget(s.info ?? 'note', s.title ?? '', s.source ?? '', s.folded ?? false),
            block: true
          }).range(s.from, s.to)
        )
        break
      case 'listBullet':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({
              widget: new BulletWidget(false, undefined, s.level ?? 0)
            }).range(s.from, s.to)
          )
        }
        break
      case 'listNumber':
        if (!s.revealed) {
          ranges.push(
            Decoration.replace({
              widget: new BulletWidget(true, Number(s.info ?? '1'), s.level ?? 0)
            }).range(s.from, s.to)
          )
        }
        break
    }
  }

  // sort=true lets CodeMirror order the mixed point/range decorations correctly.
  return Decoration.set(ranges, true)
}

/**
 * Fingerprint of the exact selection offsets. Marker-level reveal (see
 * `markerRevealed`) depends on cursor *columns*, not just lines, so any
 * selection change may flip a marker — rebuild whenever offsets change.
 * Identical-selection transactions (e.g. focus events) still skip rebuilds.
 */
function revealSignature(state: EditorState): string {
  let sig = ''
  for (const r of state.selection.ranges) {
    sig += r.from + '-' + r.to + ','
  }
  return sig
}

interface LivePreviewValue {
  deco: DecorationSet
  /** revealSignature of the state this `deco` was built from. */
  sig: string
}

/**
 * The live-preview decoration layer. Implemented as a StateField (not a
 * ViewPlugin) because block-level replacing decorations that cross line breaks
 * — our fenced-code / table / properties widgets — may only be provided through
 * the editor state, not a plugin. Rebuilds when the document changes, or when the
 * selection offsets change (marker-level reveal is column-sensitive, see
 * `revealSignature`); identical-selection transactions reuse the prior decorations.
 */
export const livePreview = StateField.define<LivePreviewValue>({
  create(state) {
    return { deco: buildDecorations(state), sig: revealSignature(state) }
  },
  update(value, tr) {
    if (tr.docChanged) {
      return { deco: buildDecorations(tr.state), sig: revealSignature(tr.state) }
    }
    if (tr.selection) {
      const sig = revealSignature(tr.state)
      if (sig === value.sig) return value
      return { deco: buildDecorations(tr.state), sig }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})
