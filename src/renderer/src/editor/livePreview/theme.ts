import { EditorView } from '@codemirror/view'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export const marginEditorTheme = EditorView.theme({
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-content ::selection': { backgroundColor: 'var(--sel)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sel)' },

  '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
  '.cm-h1': { fontSize: '1.62em', fontWeight: '680', lineHeight: '1.3', letterSpacing: '-.01em', marginTop: '18px' },
  '.cm-h2': { fontSize: '1.32em', fontWeight: '650', lineHeight: '1.35', marginTop: '14px' },
  '.cm-h3': { fontSize: '1.1em', fontWeight: '640', lineHeight: '1.4', marginTop: '10px' },
  '.cm-h4': { fontSize: '1em' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'var(--text-dim)' },

  '.cm-strong': { fontWeight: '680' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--text-dim)' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.88em',
    backgroundColor: 'var(--bg-elev)',
    padding: '1px 5px',
    borderRadius: '4px',
    color: 'var(--accent)',
    border: '1px solid var(--border-soft)'
  },

  '.cm-blockquote': {
    borderLeft: '3px solid var(--accent-line)',
    paddingLeft: '0.8em',
    color: 'var(--text-dim)',
    fontStyle: 'italic'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-elev)'
  },

  '.cm-link': { color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent-line)', cursor: 'pointer' },

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
  },

  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },

  '.cm-line': {
    padding: '1px 0'
  }
})
