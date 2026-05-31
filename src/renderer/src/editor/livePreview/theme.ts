import { EditorView } from '@codemirror/view'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

/**
 * Visual styling for the editor + live-preview decoration classes, driven by
 * the semantic Bear tokens in tokens.css. Light/dark is handled by the
 * `[data-theme]` cascade, so this theme is not hard-coded to either.
 */
export const marginEditorTheme = EditorView.theme({
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-content ::selection': { backgroundColor: 'var(--sel)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sel)' },

  '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
  '.cm-h1': { fontSize: '1.62em' },
  '.cm-h2': { fontSize: '1.32em' },
  '.cm-h3': { fontSize: '1.1em' },
  '.cm-h4': { fontSize: '1em' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'var(--text-dim)' },

  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--text-dim)' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-elev)',
    padding: '0.1em 0.3em',
    borderRadius: '4px'
  },

  '.cm-blockquote': {
    borderLeft: '3px solid var(--accent)',
    paddingLeft: '0.8em',
    color: 'var(--text-dim)'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-elev)'
  },

  '.cm-link': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },

  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '0.4em 0'
  },

  '.cm-task-checkbox': { marginRight: '0.4em', verticalAlign: 'middle' },

  '.cm-frontmatter': {
    fontFamily: MONO,
    fontSize: '0.85em',
    color: 'var(--text-dim)'
  }
})
