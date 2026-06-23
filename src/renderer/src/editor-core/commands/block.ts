import type { EditDoc, EditResult } from '../types'
import { parseListLine } from '@/editor/listContinuation'
import { rewriteLines, splitIndent, type Line } from './textLines'

const HEADING_RE = /^(#{1,6})\s+/
const QUOTE_RE = /^(\s*)>\s?/

const isBlank = (l: Line): boolean => l.text.trim() === ''

/** Strip any list/heading marker, returning the bare indent + content. */
function bareContent(lineText: string): { indent: string; content: string } {
  const p = parseListLine(lineText)
  if (p) return { indent: p.indent, content: p.content }
  return splitIndent(lineText.replace(HEADING_RE, ''))
}

/**
 * Set the ATX heading level (1–6) on every selected line, or clear it with
 * `level === 0`. Acts as a toggle: if every selected line is already a heading
 * at `level`, it clears them to plain paragraphs instead.
 */
export function setHeading(doc: EditDoc, level: number): EditResult {
  return rewriteLines(doc, (lines) => {
    const bodies = lines.map((l) => l.text.replace(HEADING_RE, ''))
    const allAtLevel = lines.every((l) => {
      const m = HEADING_RE.exec(l.text)
      return m != null && m[1].length === level
    })
    if (level === 0 || allAtLevel) return bodies
    const prefix = '#'.repeat(level) + ' '
    return bodies.map((b) => prefix + b)
  })
}

/** Toggle a `> ` blockquote prefix on every selected line. */
export function toggleBlockquote(doc: EditDoc): EditResult {
  return rewriteLines(doc, (lines) => {
    const allQuoted = lines.every((l) => isBlank(l) || QUOTE_RE.test(l.text))
    if (allQuoted) return lines.map((l) => l.text.replace(QUOTE_RE, '$1'))
    return lines.map((l) => '> ' + l.text)
  })
}

/** Toggle an unordered `- ` bullet on every selected line. */
export function toggleBulletList(doc: EditDoc): EditResult {
  return rewriteLines(doc, (lines) => {
    const allBullet = lines.every((l) => {
      const p = parseListLine(l.text)
      return isBlank(l) || (p != null && !p.ordered && !p.task)
    })
    if (allBullet) {
      return lines.map((l) => {
        const { indent, content } = bareContent(l.text)
        return indent + content
      })
    }
    return lines.map((l) => {
      if (isBlank(l)) return l.text
      const { indent, content } = bareContent(l.text)
      return `${indent}- ${content}`
    })
  })
}

/** Toggle sequential `1. ` ordered numbering on every selected line. */
export function toggleOrderedList(doc: EditDoc): EditResult {
  return rewriteLines(doc, (lines) => {
    const allOrdered = lines.every((l) => {
      const p = parseListLine(l.text)
      return isBlank(l) || (p != null && p.ordered)
    })
    if (allOrdered) {
      return lines.map((l) => {
        const { indent, content } = bareContent(l.text)
        return indent + content
      })
    }
    let n = 0
    return lines.map((l) => {
      if (isBlank(l)) return l.text
      n += 1
      const { indent, content } = bareContent(l.text)
      return `${indent}${n}. ${content}`
    })
  })
}

/** Toggle a `- [ ] ` task marker on every selected line. */
export function toggleTaskList(doc: EditDoc): EditResult {
  return rewriteLines(doc, (lines) => {
    const allTask = lines.every((l) => {
      const p = parseListLine(l.text)
      return isBlank(l) || (p != null && p.task)
    })
    if (allTask) {
      return lines.map((l) => {
        const { indent, content } = bareContent(l.text)
        return indent + content
      })
    }
    return lines.map((l) => {
      if (isBlank(l)) return l.text
      const { indent, content } = bareContent(l.text)
      return `${indent}- [ ] ${content}`
    })
  })
}
