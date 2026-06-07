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

  '.cm-code-render': {
    position: 'relative',
    fontFamily: MONO,
    fontSize: '0.88em',
    lineHeight: '1.55',
    background: 'var(--bg-elev)',
    border: '1px solid var(--border-soft)',
    borderRadius: '8px',
    padding: '12px 14px',
    margin: '8px 0',
    overflowX: 'auto',
    whiteSpace: 'pre'
  },
  '.cm-code-render code': { whiteSpace: 'pre', fontFamily: MONO },
  '.cm-code-lang': {
    position: 'absolute',
    top: '6px',
    right: '10px',
    fontSize: '0.72em',
    color: 'var(--text-faint)',
    userSelect: 'none'
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

  '.cm-table-wrap': { overflowX: 'auto', margin: '10px 0' },
  '.cm-table-render': {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '0.95em'
  },
  '.cm-table-render th, .cm-table-render td': {
    border: '1px solid var(--border)',
    padding: '6px 11px',
    textAlign: 'left'
  },
  '.cm-table-render th': {
    background: 'var(--bg-elev)',
    fontWeight: '600'
  },
  '.cm-table-render td:focus, .cm-table-render th:focus': {
    outline: '2px solid var(--accent-line)',
    outlineOffset: '-2px'
  },

  '.cm-properties': {
    border: '1px solid var(--border-soft)',
    borderRadius: '8px',
    background: 'var(--bg-panel)',
    padding: '8px 10px',
    margin: '4px 0 14px',
    fontSize: '0.9em'
  },
  '.cm-prop-row': {
    display: 'grid',
    gridTemplateColumns: '160px 1fr auto',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0'
  },
  '.cm-prop-key': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: '500',
    padding: '3px 4px',
    borderRadius: '4px'
  },
  '.cm-prop-key:focus': { background: 'var(--bg-elev)', outline: 'none' },
  '.cm-prop-input': {
    width: '100%',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    padding: '3px 6px',
    borderRadius: '4px'
  },
  '.cm-prop-input:focus': { border: '1px solid var(--accent-line)', outline: 'none' },
  '.cm-prop-del': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    opacity: '0',
    fontSize: '1.1em',
    lineHeight: '1'
  },
  '.cm-prop-row:hover .cm-prop-del': { opacity: '1' },
  '.cm-prop-add': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    fontSize: '0.88em',
    padding: '4px',
    marginTop: '2px'
  },
  '.cm-prop-add:hover': { color: 'var(--accent)' },

  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },

  '.cm-line': {
    padding: '1px 0'
  }
})
