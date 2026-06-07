import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Custom syntax-highlight style. Replaces CodeMirror's defaultHighlightStyle,
 * whose `tags.heading` rule adds `text-decoration: underline` — the source of
 * the unwanted heading underline. Heading weight is handled by theme.ts `.cm-h*`,
 * so here headings get NO decoration. Also defines code-token colors (reused by
 * the fenced-code widget via classes mounted through syntaxHighlighting()).
 */
export const marginHighlightStyle = HighlightStyle.define([
  // Headings: explicitly no underline. (Weight comes from .cm-h* in theme.ts.)
  { tag: t.heading, textDecoration: 'none' },

  // Code tokens — colors from tokens.css semantic vars.
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--code-variable)' },
  { tag: [t.propertyName], color: 'var(--code-property)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--code-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--code-constant)' },
  { tag: [t.string, t.inserted, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-number)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--code-type)' },
  { tag: [t.comment, t.meta], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.operator, t.operatorKeyword], color: 'var(--code-operator)' },
  { tag: [t.regexp, t.escape], color: 'var(--code-string)' },
  { tag: t.invalid, color: 'var(--code-invalid)' }
])
