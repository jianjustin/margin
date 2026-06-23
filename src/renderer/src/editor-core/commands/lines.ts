import type { EditDoc, EditResult } from '../types'
import { lineEnd, lineStart, selectedLines } from './textLines'

/** The offset span of the block of lines the selection touches. */
function selectedBlock(text: string, from: number, to: number): { from: number; to: number } {
  const lines = selectedLines(text, from, to)
  return { from: lines[0].from, to: lines[lines.length - 1].to }
}

/**
 * Move the selected line(s) up (`dir = -1`) or down (`dir = 1`), swapping with
 * the adjacent line. Returns null at the document edge (nothing to swap with).
 */
export function moveLines(doc: EditDoc, dir: -1 | 1): EditResult | null {
  const { text } = doc
  const block = selectedBlock(text, doc.selection.from, doc.selection.to)
  const body = text.slice(block.from, block.to)

  if (dir === -1) {
    if (block.from === 0) return null // already at the top
    const prevStart = lineStart(text, block.from - 1)
    const prevLine = text.slice(prevStart, block.from - 1)
    const insert = body + '\n' + prevLine
    return {
      changes: [{ from: prevStart, to: block.to, insert }],
      selection: { from: prevStart, to: prevStart + body.length }
    }
  }

  if (block.to >= text.length) return null // already at the bottom
  const nextEnd = lineEnd(text, block.to + 1)
  const nextLine = text.slice(block.to + 1, nextEnd)
  const insert = nextLine + '\n' + body
  const newFrom = block.from + nextLine.length + 1
  return {
    changes: [{ from: block.from, to: nextEnd, insert }],
    selection: { from: newFrom, to: newFrom + body.length }
  }
}

/**
 * Duplicate the selected line(s), inserting the copy directly below and moving
 * the selection onto the copy.
 */
export function duplicateLines(doc: EditDoc): EditResult {
  const { text } = doc
  const block = selectedBlock(text, doc.selection.from, doc.selection.to)
  const body = text.slice(block.from, block.to)
  return {
    changes: [{ from: block.to, to: block.to, insert: '\n' + body }],
    selection: { from: block.to + 1, to: block.to + 1 + body.length }
  }
}
