import type { EditDoc, EditResult } from '../types'

/** A single line within a document: its offset span and text (newline excluded). */
export interface Line {
  from: number
  to: number
  text: string
}

/** Offset of the start of the line containing `pos`. */
export function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1
}

/** Offset of the end of the line containing `pos` (the next `\n`, or doc end). */
export function lineEnd(text: string, pos: number): number {
  const nl = text.indexOf('\n', pos)
  return nl === -1 ? text.length : nl
}

/**
 * Every line touched by the selection `[from, to]`, in document order. A caret
 * (`from === to`) yields the single line it sits on.
 */
export function selectedLines(text: string, from: number, to: number): Line[] {
  const start = lineStart(text, from)
  const end = lineEnd(text, to)
  const lines: Line[] = []
  let cursor = start
  for (const part of text.slice(start, end).split('\n')) {
    lines.push({ from: cursor, to: cursor + part.length, text: part })
    cursor += part.length + 1 // account for the '\n'
  }
  return lines
}

/**
 * Run a line-oriented block transform over the selection: hand `transform` the
 * touched lines, splice its returned line texts back as one change, and re-select
 * the rewritten region. Pure — used by every block-prefix command.
 */
export function rewriteLines(doc: EditDoc, transform: (lines: Line[]) => string[]): EditResult {
  const lines = selectedLines(doc.text, doc.selection.from, doc.selection.to)
  const insert = transform(lines).join('\n')
  const from = lines[0].from
  const to = lines[lines.length - 1].to
  return { changes: [{ from, to, insert }], selection: { from, to: from + insert.length } }
}

/** Split a line into leading whitespace and the rest. */
export function splitIndent(lineText: string): { indent: string; content: string } {
  const m = /^(\s*)(.*)$/.exec(lineText)
  return { indent: m?.[1] ?? '', content: m?.[2] ?? lineText }
}
