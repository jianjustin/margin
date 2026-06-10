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
