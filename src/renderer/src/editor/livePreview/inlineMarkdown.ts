/**
 * Minimal inline Markdown renderer for table cell content.
 * Supports: `code` (highest priority), **bold**, *italic*, ~~strike~~, [link](url).
 * Returns a DocumentFragment; append it to a DOM element to display.
 */
export function renderInlineMarkdown(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  // Code spans matched first (backtick fences win over all other markers inside).
  // Bold before italic so ** isn't consumed as two * characters.
  const re =
    /`([^`]+)`|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|~~([^~\n]+?)~~|\[([^\]\n]*)\]\(([^)\n]*)\)/g
  let lastIndex = 0

  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)))
    }

    let el: HTMLElement
    if (m[1] !== undefined) {
      el = document.createElement('code')
      el.textContent = m[1]
    } else if (m[2] !== undefined) {
      el = document.createElement('strong')
      el.textContent = m[2]
    } else if (m[3] !== undefined) {
      el = document.createElement('em')
      el.textContent = m[3]
    } else if (m[4] !== undefined) {
      el = document.createElement('s')
      el.textContent = m[4]
    } else {
      el = document.createElement('a')
      el.textContent = m[5] ?? ''
      ;(el as HTMLAnchorElement).href = m[6] ?? '#'
      el.addEventListener('click', (e) => e.preventDefault())
    }

    frag.appendChild(el)
    lastIndex = idx + m[0].length
  }

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)))
  }

  return frag
}
