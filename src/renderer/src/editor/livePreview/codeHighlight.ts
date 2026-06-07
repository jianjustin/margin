import { LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightCode } from '@lezer/highlight'
import { marginHighlightStyle } from './highlightStyle'

/**
 * Build highlighted children for `code` in the given language into `target`
 * (a <code> element). Uses the loaded Lezer parser + marginHighlightStyle so
 * colors match the editor. The parser must already be loaded (caller awaits
 * `LanguageDescription.load()` or uses an already-resolved `support`).
 */
export function highlightInto(target: HTMLElement, code: string, support: LanguageSupport): void {
  target.textContent = ''
  const tree = support.language.parser.parse(code)
  highlightCode(
    code,
    tree,
    marginHighlightStyle,
    (text, classes) => {
      const span = document.createElement('span')
      if (classes) span.className = classes
      span.textContent = text
      target.appendChild(span)
    },
    () => target.appendChild(document.createElement('br'))
  )
}

/** Find a LanguageDescription by fenced-code info string (e.g. "ts", "python"). */
export function findLanguage(info: string): LanguageDescription | null {
  if (!info) return null
  return LanguageDescription.matchLanguageName(languages, info, true)
}
