export interface InlineMarkdownOptions {
  onWikiLinkClick?: (target: string, event: MouseEvent) => void
}

function parseWikiInner(inner: string): { target: string; display: string } {
  const pipeIdx = inner.indexOf('|')
  const rawTarget = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner
  const target = rawTarget.split('#')[0].trim()
  const display = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : target).trim()
  return { target, display: display || target }
}

function wikiGlyphSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const addPath = (d: string): void => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }

  addPath('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z')
  addPath('M14 2v6h6')
  addPath('M8 13h8')
  addPath('M8 17h6')
  return svg
}

export function createWikiLinkElement(
  target: string,
  display: string,
  onClick?: (target: string, event: MouseEvent) => void
): HTMLElement {
  const span = document.createElement('span')
  span.className = 'cm-wiki-link'
  span.dataset.wikiTarget = target
  span.title = `打开 ${target}`
  span.setAttribute('role', 'link')

  const glyph = document.createElement('span')
  glyph.className = 'cm-wiki-link-glyph'
  glyph.setAttribute('aria-hidden', 'true')
  glyph.appendChild(wikiGlyphSvg())
  span.appendChild(glyph)

  const label = document.createElement('span')
  label.className = 'cm-wiki-link-label'
  label.textContent = display
  span.appendChild(label)

  if (onClick) {
    span.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick(target, event)
    })
  }

  return span
}

/**
 * Minimal inline Markdown renderer for table cell content.
 * Supports: `code` (highest priority), [[wiki]], **bold**, *italic*, ~~strike~~, [link](url).
 * Returns a DocumentFragment; append it to a DOM element to display.
 */
export function renderInlineMarkdown(
  text: string,
  options: InlineMarkdownOptions = {}
): DocumentFragment {
  const frag = document.createDocumentFragment()
  // Code spans matched first (backtick fences win over all other markers inside).
  // Bold before italic so ** isn't consumed as two * characters.
  const re =
    /`([^`]+)`|\[\[([^\]\n]+)\]\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|~~([^~\n]+?)~~|\[([^\]\n]*)\]\(([^)\n]*)\)/g
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
      const wiki = parseWikiInner(m[2])
      el = createWikiLinkElement(wiki.target, wiki.display, options.onWikiLinkClick)
    } else if (m[3] !== undefined) {
      el = document.createElement('strong')
      el.textContent = m[3]
    } else if (m[4] !== undefined) {
      el = document.createElement('em')
      el.textContent = m[4]
    } else if (m[5] !== undefined) {
      el = document.createElement('s')
      el.textContent = m[5]
    } else {
      el = document.createElement('a')
      el.textContent = m[6] ?? ''
      ;(el as HTMLAnchorElement).href = m[7] ?? '#'
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
