import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import {
  collectBlockDecorations,
  collectInlineDecorations,
  type BlockRegion
} from './decorationSpecs'
import { rangeRevealed } from './reveal'
import {
  CheckboxWidget,
  HrWidget,
  CodeBlockWidget,
  DiagramWidget,
  TableWidget,
  PropertiesWidget,
  ImageWidget,
  ImageBlockWidget,
  MediaWidget,
  MediaBlockWidget,
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
const taskSrcMark = Decoration.mark({ class: 'cm-task-src' })
const imageSrcMark = Decoration.mark({ class: 'cm-image-src' })
const taskDoneMark = Decoration.mark({ class: 'cm-task-done' })
const boldMark = Decoration.mark({ class: 'cm-strong' })
const italicMark = Decoration.mark({ class: 'cm-em' })
const strikeMark = Decoration.mark({ class: 'cm-strike' })
const inlineCodeMark = Decoration.mark({ class: 'cm-inline-code' })
const linkMark = Decoration.mark({ class: 'cm-link' })
const highlightMark = Decoration.mark({ class: 'cm-highlight' })
const quoteLine = Decoration.line({ class: 'cm-blockquote' })
const codeLine = Decoration.line({ class: 'cm-code-block' })
const frontmatterLine = Decoration.line({ class: 'cm-frontmatter' })

function resolveAsset(state: EditorState, src: string): string | null {
  const dp = state.facet(docPathFacet)
  const root = state.facet(vaultRootFacet)
  const cfg = state.facet(richContentConfigFacet)
  return isExternal(src) ? src : resolveMarkdownAsset(src, dp, root, cfg.assetsDir)
}

export interface LivePreviewBlockValue {
  deco: DecorationSet
  regions: readonly BlockRegion[]
  /** 每个 region 一位：当前 selection 是否 reveal 它。Task 5 用于短路。 */
  bits: string
}

function revealBits(state: EditorState, regions: readonly BlockRegion[]): string {
  let bits = ''
  for (const r of regions) bits += rangeRevealed(state, r.from, r.to) ? '1' : '0'
  return bits
}

function buildBlockValue(state: EditorState): LivePreviewBlockValue {
  const { specs, regions } = collectBlockDecorations(state)
  const ranges: Range<Decoration>[] = []
  for (const s of specs) {
    switch (s.kind) {
      case 'frontmatter':
        ranges.push(frontmatterLine.range(s.from))
        break
      case 'codeLine':
        ranges.push(codeLine.range(s.from))
        break
      case 'properties':
        ranges.push(
          Decoration.replace({
            widget: new PropertiesWidget(s.source ?? '', s.from, s.to),
            block: true
          }).range(s.from, s.to)
        )
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
      case 'image':
      case 'media': {
        if (s.placement !== 'block') break
        const src = s.source ?? ''
        const resolved = resolveAsset(state, src)
        const widget =
          s.kind === 'media'
            ? new MediaBlockWidget(src, s.info ?? '', resolved, s.width, s.height)
            : new ImageBlockWidget(src, s.info ?? '', resolved, s.width, s.height)
        ranges.push(
          Decoration.widget({ widget, block: true, side: 1 }).range(state.doc.lineAt(s.to).to)
        )
        break
      }
    }
  }
  return { deco: Decoration.set(ranges, true), regions, bits: revealBits(state, regions) }
}

export const livePreviewBlock = StateField.define<LivePreviewBlockValue>({
  create: (state) => buildBlockValue(state),
  update(value, tr) {
    if (tr.docChanged) return buildBlockValue(tr.state)
    if (tr.selection) {
      // regions 在无 doc 变化时位置有效：仅当某个 block 的 reveal 位翻转才重建
      if (revealBits(tr.state, value.regions) === value.bits) return value
      return buildBlockValue(tr.state)
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

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

function buildInlineDecorations(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const state = view.state
  const specs = collectInlineDecorations(state, view.viewport.from, view.viewport.to)
  const ranges: Range<Decoration>[] = []
  const atomic: Range<Decoration>[] = []

  function pushInlineReplace(deco: Decoration, from: number, to: number): void {
    ranges.push(deco.range(from, to))
    atomic.push(deco.range(from, to))
  }

  for (const s of specs) {
    switch (s.kind) {
      case 'hide':
        if (!s.revealed && s.to > s.from) {
          pushInlineReplace(hideMark, s.from, s.to)
        }
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
      case 'hr':
        if (!s.revealed) {
          pushInlineReplace(Decoration.replace({ widget: new HrWidget(), block: false }), s.from, s.to)
        }
        break
      case 'task':
        if (!s.revealed) {
          pushInlineReplace(
            Decoration.replace({ widget: new CheckboxWidget(s.checked ?? false, s.from, s.to) }),
            s.from,
            s.to
          )
        } else {
          ranges.push(taskSrcMark.range(s.from, s.to))
        }
        break
      case 'taskDoneText':
        if (!s.revealed) ranges.push(taskDoneMark.range(s.from, s.to))
        break
      case 'footnoteRef':
        pushInlineReplace(
          Decoration.replace({ widget: new FootnoteWidget(s.source ?? '', s.info ?? '') }),
          s.from,
          s.to
        )
        break
      case 'wikiLink':
        if (!s.revealed) {
          pushInlineReplace(
            Decoration.replace({ widget: new WikiLinkWidget(s.info ?? '', s.source ?? s.info ?? '') }),
            s.from,
            s.to
          )
        }
        break
      case 'mathInline': {
        const cfg = state.facet(richContentConfigFacet)
        if (cfg.mathEnabled) {
          pushInlineReplace(Decoration.replace({ widget: new MathWidget(s.source ?? '', false) }), s.from, s.to)
        }
        break
      }
      case 'listBullet':
        if (!s.revealed) {
          pushInlineReplace(
            Decoration.replace({ widget: new BulletWidget(false, undefined, s.level ?? 0) }),
            s.from,
            s.to
          )
        }
        break
      case 'listNumber':
        if (!s.revealed) {
          pushInlineReplace(
            Decoration.replace({ widget: new BulletWidget(true, Number(s.info ?? '1'), s.level ?? 0) }),
            s.from,
            s.to
          )
        }
        break
      case 'image':
      case 'media': {
        const src = s.source ?? ''
        if (s.placement === 'block') {
          // block widget 由 StateField 提供；这里只管源行的隐藏/标注
          if (!s.revealed) {
            pushInlineReplace(hideMark, s.from, s.to)
          } else {
            ranges.push(imageSrcMark.range(s.from, s.to))
          }
        } else if (!s.revealed) {
          const resolved = resolveAsset(state, src)
          const widget =
            s.kind === 'media'
              ? new MediaWidget(src, s.info ?? '', resolved, s.width, s.height)
              : new ImageWidget(src, s.info ?? '', resolved, s.width, s.height)
          pushInlineReplace(Decoration.replace({ widget }), s.from, s.to)
        } else {
          ranges.push(imageSrcMark.range(s.from, s.to))
        }
        break
      }
    }
  }
  return { deco: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) }
}

export const livePreviewInline = ViewPlugin.fromClass(
  class {
    deco: DecorationSet
    atomic: DecorationSet
    sig: string

    constructor(view: EditorView) {
      this.sig = revealSignature(view.state)
      const built = buildInlineDecorations(view)
      this.deco = built.deco
      this.atomic = built.atomic
    }

    update(update: ViewUpdate): void {
      const sig = revealSignature(update.state)
      if (!update.docChanged && !update.viewportChanged && sig === this.sig) return
      this.sig = sig
      const built = buildInlineDecorations(update.view)
      this.deco = built.deco
      this.atomic = built.atomic
    }
  },
  { decorations: (v) => v.deco }
)

/** Inline replace 注册为 atomicRanges，光标不落进被隐藏的语法序列（同旧行为，来源改为 plugin）。 */
export const livePreviewAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(livePreviewInline)?.atomic ?? Decoration.none
)

/**
 * live-preview 装饰层入口：block 级来自 StateField（CM 要求），inline 级来自
 * viewport 限定的 ViewPlugin。
 */
export const livePreview: Extension = [livePreviewBlock, livePreviewInline]
