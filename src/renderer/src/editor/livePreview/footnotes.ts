export interface FootnoteRefMatch {
  index: number
  length: number
  label: string
}

/** All `[^label]` references in `text` (definitions `[^label]:` excluded). */
export function collectFootnoteRefs(text: string): FootnoteRefMatch[] {
  const out: FootnoteRefMatch[] = []
  const re = /\[\^([^\]\s]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (text[m.index + m[0].length] === ':') continue
    out.push({ index: m.index, length: m[0].length, label: m[1] })
  }
  return out
}

/** First-line text of the `[^label]:` definition in the document, or null. */
export function findFootnoteDef(docText: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^\\[\\^${esc}\\]:[ \\t]?(.*)$`, 'm').exec(docText)
  return m ? m[1].trim() : null
}
