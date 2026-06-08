import { EditorView, keymap, type KeyBinding } from '@codemirror/view'

export interface ParsedListLine {
  /** Leading whitespace before the bullet/number. */
  indent: string
  /** True for an ordered (`1.`) item, false for a bullet (`-`/`*`/`+`). */
  ordered: boolean
  /** The ordered-list number, when `ordered`. */
  number?: number
  /** The bullet character for unordered lists (`-`, `*`, or `+`). */
  bullet?: string
  /** True when the item carries a `[ ]` / `[x]` task checkbox. */
  task: boolean
  /** The full leading marker including trailing space(s), e.g. `- ` or `1. [ ] `. */
  marker: string
  /** Everything after the marker (the item's text). */
  content: string
}

const LIST_RE = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?(.*)$/

/** Parse a single line as a markdown list item, or return null if it is not one. */
export function parseListLine(text: string): ParsedListLine | null {
  const m = LIST_RE.exec(text)
  if (!m) return null
  const [, indent, bulletTok, space, taskRaw, content] = m
  const ordered = /^\d+\.$/.test(bulletTok)
  return {
    indent,
    ordered,
    number: ordered ? parseInt(bulletTok, 10) : undefined,
    bullet: ordered ? undefined : bulletTok,
    task: Boolean(taskRaw),
    marker: bulletTok + space + (taskRaw ?? ''),
    content
  }
}

export type ListEnterAction =
  | { type: 'continue'; insert: string }
  | { type: 'clear'; from: number; to: number }
  | null

/**
 * Decide what pressing Enter on a list line should do. Pure: takes the line
 * text, the document offset of the line start, and the caret offset.
 *
 * - On a non-empty item → continue the list, emitting the next marker
 *   (incremented number for ordered lists, fresh `[ ]` for tasks).
 * - On an empty item (marker but no text) → clear the marker, exiting the list.
 * - On anything else → null (let the editor's default Enter run).
 */
export function listEnterAction(
  lineText: string,
  lineFrom: number,
  caret: number
): ListEnterAction {
  const parsed = parseListLine(lineText)
  if (!parsed) return null

  const markerLen = parsed.indent.length + parsed.marker.length
  // Only act once the caret is at or past the marker — typing inside the marker
  // itself (e.g. between `1` and `.`) should behave normally.
  if (caret - lineFrom < markerLen) return null

  if (parsed.content.trim() === '') {
    // Empty item: remove the whole marker so Enter drops out of the list.
    return { type: 'clear', from: lineFrom, to: lineFrom + markerLen }
  }

  const bulletPart = parsed.ordered ? `${(parsed.number ?? 0) + 1}.` : parsed.bullet ?? '-'
  const taskPart = parsed.task ? '[ ] ' : ''
  const nextMarker = `${bulletPart} ${taskPart}`
  return { type: 'continue', insert: `\n${parsed.indent}${nextMarker}` }
}

function handleEnter(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  const action = listEnterAction(line.text, line.from, range.head)
  if (!action) return false

  if (action.type === 'clear') {
    view.dispatch({
      changes: { from: action.from, to: action.to, insert: '' },
      selection: { anchor: action.from },
      scrollIntoView: true,
      userEvent: 'input'
    })
    return true
  }

  view.dispatch({
    changes: { from: range.head, insert: action.insert },
    selection: { anchor: range.head + action.insert.length },
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

/** Keymap binding that auto-continues markdown lists on Enter. */
export const listContinuationKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: handleEnter }
]

export const listContinuation = keymap.of(listContinuationKeymap)
