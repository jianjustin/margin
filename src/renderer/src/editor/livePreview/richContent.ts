import type { EditorState } from '@codemirror/state'
import { Facet } from '@codemirror/state'
import type { Tree } from '@lezer/common'
import { rangeRevealed } from './reveal'

export type DiagramKind = 'mermaid' | 'plantuml' | 'dot'
export type MediaKind = 'video' | 'audio'

export interface RichContentConfig {
  assetsDir: string
  plantUmlServerUrl: string
  diagramFitWidth: boolean
  mathEnabled: boolean
}

export const DEFAULT_RICH_CONTENT_CONFIG: RichContentConfig = {
  assetsDir: 'assets',
  plantUmlServerUrl: 'https://kroki.io',
  diagramFitWidth: true,
  mathEnabled: true
}

export const richContentConfigFacet = Facet.define<Partial<RichContentConfig>, RichContentConfig>({
  combine(values) {
    return { ...DEFAULT_RICH_CONTENT_CONFIG, ...Object.assign({}, ...values) }
  }
})

const DIAGRAM_LANGS: Record<string, DiagramKind> = {
  mermaid: 'mermaid',
  plantuml: 'plantuml',
  puml: 'plantuml',
  dot: 'dot',
  graphviz: 'dot'
}

const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'])

export interface ImageMeta {
  alt: string
  url: string
  width?: number
  height?: number
  mediaKind?: MediaKind
}

export interface CalloutMeta {
  type: string
  title: string
  folded: boolean
  body: string
}

export interface MathRange {
  from: number
  to: number
  source: string
  block: boolean
}

export interface HighlightRange {
  from: number
  to: number
  markerFrom: number
  markerTo: number
}

export function diagramKindForInfo(info: string): DiagramKind | null {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return DIAGRAM_LANGS[lang] ?? null
}

export function parseImageMeta(altText: string, rawUrl: string): ImageMeta {
  const { label, width: altWidth } = parseAltWidth(altText)
  const { url, width: urlWidth, height } = parseUrlSize(rawUrl)
  const ext = extensionOf(url)
  const mediaKind = VIDEO_EXT.has(ext) ? 'video' : AUDIO_EXT.has(ext) ? 'audio' : undefined
  return {
    alt: label,
    url,
    width: altWidth ?? urlWidth,
    height,
    mediaKind
  }
}

function parseAltWidth(altText: string): { label: string; width?: number } {
  const idx = altText.lastIndexOf('|')
  if (idx < 0) return { label: altText }
  const rawWidth = altText.slice(idx + 1).trim()
  if (!/^\d{1,5}$/.test(rawWidth)) return { label: altText }
  return { label: altText.slice(0, idx).trim(), width: Number(rawWidth) }
}

function parseUrlSize(rawUrl: string): { url: string; width?: number; height?: number } {
  const match = rawUrl.match(/\s+=([0-9]{1,5})?x([0-9]{1,5})?\s*$/)
  if (!match) return { url: rawUrl.trim() }
  const width = match[1] ? Number(match[1]) : undefined
  const height = match[2] ? Number(match[2]) : undefined
  return { url: rawUrl.slice(0, match.index).trim(), width, height }
}

function extensionOf(url: string): string {
  const clean = url.split(/[?#]/, 1)[0]
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : ''
}

export function parseCallout(source: string): CalloutMeta | null {
  const lines = source.split('\n')
  const first = lines[0] ?? ''
  const match = first.match(/^>\s*\[!([a-zA-Z]+)\]([+-])?(?:\s+(.*))?$/)
  if (!match) return null
  const type = normalizeCalloutType(match[1])
  const title = (match[3] ?? defaultCalloutTitle(type)).trim()
  const body = lines
    .slice(1)
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
  return {
    type,
    title,
    folded: match[2] === '-',
    body
  }
}

function normalizeCalloutType(type: string): string {
  const lower = type.toLowerCase()
  if (lower === 'failure' || lower === 'fail' || lower === 'error' || lower === 'bug') return 'danger'
  if (lower === 'success' || lower === 'check' || lower === 'done') return 'tip'
  if (lower === 'important' || lower === 'attention' || lower === 'caution') return 'warning'
  if (lower === 'abstract' || lower === 'summary' || lower === 'tldr') return 'info'
  if (['note', 'warning', 'danger', 'tip', 'info', 'quote'].includes(lower)) return lower
  return 'note'
}

function defaultCalloutTitle(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function collectMathRanges(
  state: EditorState,
  tree: Tree,
  shouldSkip: (pos: number) => boolean
): MathRange[] {
  const ranges: MathRange[] = []
  const doc = state.doc
  const blockSpans: Array<{ from: number; to: number }> = []

  let lineNo = 1
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo)
    if (!/^\s*\$\$\s*$/.test(line.text) || shouldSkip(line.from)) {
      lineNo += 1
      continue
    }
    let closeNo = lineNo + 1
    while (closeNo <= doc.lines) {
      const close = doc.line(closeNo)
      if (/^\s*\$\$\s*$/.test(close.text)) break
      closeNo += 1
    }
    if (closeNo > doc.lines) break
    const close = doc.line(closeNo)
    const from = line.from
    const to = close.to
    blockSpans.push({ from, to })
    if (!rangeRevealed(state, from, to)) {
      ranges.push({
        from,
        to,
        block: true,
        source: doc.sliceString(line.to + 1, close.from).trim()
      })
    }
    lineNo = closeNo + 1
  }

  const inMathBlock = (from: number): boolean => blockSpans.some((span) => from >= span.from && from < span.to)
  const text = doc.toString()
  const inlineRe = /(^|[^\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$/g
  for (const match of text.matchAll(inlineRe)) {
    const prefix = match[1] ?? ''
    const from = (match.index ?? 0) + prefix.length
    const to = from + match[0].length - prefix.length
    if (inMathBlock(from) || shouldSkip(from)) continue
    if (rangeRevealed(state, from, to)) continue
    ranges.push({ from, to, block: false, source: match[2] })
  }

  return ranges
}

export function collectHighlightRanges(
  state: EditorState,
  tree: Tree,
  shouldSkip: (pos: number) => boolean
): HighlightRange[] {
  const ranges: HighlightRange[] = []
  const text = state.doc.toString()
  const re = /(^|[^=\\])==([^=\n].*?[^=\n])==/g
  for (const match of text.matchAll(re)) {
    const prefix = match[1] ?? ''
    const markerFrom = (match.index ?? 0) + prefix.length
    const markerTo = markerFrom + match[0].length - prefix.length
    if (shouldSkip(markerFrom) || rangeRevealed(state, markerFrom, markerTo)) continue
    ranges.push({
      from: markerFrom + 2,
      to: markerTo - 2,
      markerFrom,
      markerTo
    })
  }
  return ranges
}
