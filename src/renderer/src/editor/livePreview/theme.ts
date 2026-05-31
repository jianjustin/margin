import { EditorView } from '@codemirror/view'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Visual styling for the live-preview decoration classes. */
export const marginEditorTheme = EditorView.theme({
  '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
  '.cm-h1': { fontSize: '1.62em' },
  '.cm-h2': { fontSize: '1.32em' },
  '.cm-h3': { fontSize: '1.1em' },
  '.cm-h4': { fontSize: '1em' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'hsl(var(--muted-foreground))' },

  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))',
    padding: '0.1em 0.3em',
    borderRadius: '4px'
  },

  '.cm-blockquote': {
    borderLeft: '3px solid hsl(var(--primary))',
    paddingLeft: '0.8em',
    color: 'hsl(var(--muted-foreground))'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))'
  },

  '.cm-link': { color: 'hsl(var(--primary))', textDecoration: 'underline', cursor: 'pointer' },

  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid hsl(var(--border))',
    margin: '0.4em 0'
  },

  '.cm-task-checkbox': { marginRight: '0.4em', verticalAlign: 'middle' }
})
