import type { Transaction } from '@codemirror/state'

/**
 * Whether typing "/" at the caret should open the slash command menu.
 *
 * `charBefore` is the single character immediately before the caret on its line,
 * or "" when the caret is at the start of the line. The menu opens when "/"
 * begins a new token — at line start or right after whitespace — which also
 * covers after a list marker ("- ") or quote ("> "). Requiring whitespace before
 * it avoids false triggers such as typing the second slash of "http://".
 */
export function slashMenuTriggers(charBefore: string): boolean {
  return charBefore === '' || /\s/.test(charBefore)
}

/**
 * If `tr` is a user typing transaction that inserted a single "/" where the
 * slash menu should open, return the caret position right AFTER the slash;
 * otherwise null.
 *
 * Detecting the actual insertion (instead of intercepting the "/" keydown)
 * makes the trigger reliable under IME composition — during composition key
 * events arrive as keyCode 229 and keymaps never fire, but the final commit
 * still produces an `input.type.compose` transaction we can see here.
 */
export function slashInsertedAt(tr: Transaction): number | null {
  if (!tr.docChanged || !tr.isUserEvent('input.type')) return null
  let slashPos = -1
  tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    if (inserted.length === 1 && inserted.sliceString(0, 1) === '/') slashPos = toB - 1
  })
  if (slashPos < 0) return null
  const line = tr.newDoc.lineAt(slashPos)
  const charBefore = slashPos > line.from ? tr.newDoc.sliceString(slashPos - 1, slashPos) : ''
  return slashMenuTriggers(charBefore) ? slashPos + 1 : null
}
