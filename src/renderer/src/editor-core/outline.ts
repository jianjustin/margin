/**
 * Table-of-contents extraction — walks Markdown text for H1–H3 headings.
 *
 * Pure string-scanning over the raw document text; no CodeMirror or renderer
 * dependency. Skips frontmatter (`---` … `---` at the very top of the doc)
 * and fenced code blocks (``` … ```) so headings inside either are ignored.
 */

export interface OutlineItem {
  level: 1 | 2 | 3
  text: string
  line: number
}

/** Collect H1–H3 headings from Markdown `text`, in document order. */
export function collectOutline(text: string): OutlineItem[] {
  const lines = text.split('\n')
  const headings: OutlineItem[] = []
  let inFence = false
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && line === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      continue
    }
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      headings.push({ level: m[1].length as 1 | 2 | 3, text: m[2].trim(), line: i })
    }
  }
  return headings
}
