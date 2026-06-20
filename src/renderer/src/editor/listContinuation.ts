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

/** Width of one list-indent step in spaces (Tab equivalent). */
export const LIST_INDENT = 4

/**
 * Returns the line text with LIST_INDENT spaces prepended, or null when the
 * line is not a markdown list item (Tab should fall through to the default handler).
 */
export function indentListLine(lineText: string): string | null {
  if (!parseListLine(lineText)) return null
  return '    ' + lineText
}

/**
 * Returns the line text with up to LIST_INDENT leading spaces removed, or null
 * when the line has no indent (nothing to outdent) or is not a list item.
 */
export function outdentListLine(lineText: string): string | null {
  const parsed = parseListLine(lineText)
  if (!parsed || parsed.indent.length === 0) return null
  const trim = Math.min(LIST_INDENT, parsed.indent.length)
  return lineText.slice(trim)
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

function handleTab(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  const newText = indentListLine(line.text)
  if (!newText) return false
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: range.head + LIST_INDENT },
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

function handleShiftTab(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  const newText = outdentListLine(line.text)
  if (!newText) return false
  const trim = line.text.length - newText.length
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: Math.max(line.from, range.head - trim) },
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

/** Keymap binding that auto-continues markdown lists on Enter. */
export const listContinuationKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: handleEnter },
  { key: 'Tab', run: handleTab },
  { key: 'Shift-Tab', run: handleShiftTab }
]

export const listContinuation = keymap.of(listContinuationKeymap)
