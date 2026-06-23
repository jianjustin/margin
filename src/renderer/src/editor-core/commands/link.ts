import type { EditDoc, EditResult } from '../types'

/**
 * Wrap the selection as a Markdown link `[text](url)`. With a non-empty
 * selection the text becomes the label and the caret/selection lands in the URL
 * slot; with an empty selection an empty `[](url)` is inserted with the caret in
 * the label slot. `url` pre-fills the destination (e.g. a pasted URL).
 */
export function wrapLink(doc: EditDoc, url = ''): EditResult {
  const { text } = doc
  const { from, to } = doc.selection
  const label = text.slice(from, to)

  if (from === to) {
    const insert = `[](${url})`
    return { changes: [{ from, to, insert }], selection: { from: from + 1, to: from + 1 } }
  }

  const insert = `[${label}](${url})`
  // URL slot opens after `[label](`
  const urlFrom = from + label.length + 3
  return {
    changes: [{ from, to, insert }],
    selection: { from: urlFrom, to: urlFrom + url.length }
  }
}
