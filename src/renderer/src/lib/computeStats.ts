export interface DocStats {
  chars: number
  words: number
  minutes: number
  blocks: number
}

const CJK = /[一-鿿぀-ヿ가-힯]/g
const EN_WORD = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g
const WORDS_PER_MIN = 320

/**
 * Lightweight document statistics over raw markdown. CJK characters are counted
 * individually; runs of Latin/alphanumeric (incl. apostrophes/hyphens) count as
 * one word each. Blocks = paragraphs separated by blank lines. Pure & read-only.
 */
export function computeStats(markdown: string): DocStats {
  const chars = (markdown.match(CJK) ?? []).length
  const englishWords = (markdown.match(EN_WORD) ?? []).length
  const words = chars + englishWords
  const minutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MIN)) : 0
  const blocks = markdown
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0).length

  return { chars, words, minutes, blocks }
}
