import { EditorView } from '@codemirror/view'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export const marginEditorTheme = EditorView.theme({
  '.cm-content': {
    caretColor: 'var(--text)',
    color: 'var(--text)',
    fontVariantLigatures: 'contextual'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-content ::selection': { backgroundColor: 'var(--sel)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sel)' },

  '.cm-heading': {
    fontFamily: 'var(--editor)',
    fontWeight: '600',
    lineHeight: '1.28',
    color: 'var(--text)'
  },
  '.cm-h1': { fontSize: '1.44em', fontWeight: '650', lineHeight: '1.28', paddingTop: '6px' },
  '.cm-h2': { fontSize: '1.22em', fontWeight: '635', lineHeight: '1.32', paddingTop: '4px' },
  '.cm-h3': { fontSize: '1.07em', fontWeight: '620', lineHeight: '1.38', paddingTop: '2px' },
  '.cm-h4': { fontSize: '1em', fontWeight: '610' },
  '.cm-h5': { fontSize: '0.95em' },
  '.cm-h6': { fontSize: '0.9em', color: 'var(--text-dim)' },

  '.cm-strong': { fontWeight: '650' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--text-dim)' },

  '.cm-inline-code': {
    fontFamily: MONO,
    fontSize: '0.86em',
    backgroundColor: 'var(--bg-elev)',
    padding: '0 4px',
    borderRadius: '4px',
    color: 'var(--accent)',
    border: '1px solid var(--border-soft)'
  },

  '.cm-blockquote': {
    borderLeft: '2px solid var(--accent-line)',
    paddingLeft: '0.72em',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
    background: 'transparent'
  },

  '.cm-code-block': {
    fontFamily: MONO,
    fontSize: '0.87em',
    lineHeight: '1.54',
    backgroundColor: 'var(--bg-elev)'
  },

  '.cm-code-render': {
    position: 'relative',
    fontFamily: MONO,
    fontSize: '13px',
    lineHeight: '1.56',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-soft)',
    borderRadius: 'var(--r)',
    padding: '10px 12px',
    margin: '7px 0',
    overflowX: 'auto',
    whiteSpace: 'pre',
    boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.03)'
  },
  '.cm-code-render code': { display: 'block', paddingRight: '60px', whiteSpace: 'pre', fontFamily: MONO },
  '.cm-code-lang': {
    position: 'absolute',
    top: '7px',
    right: '9px',
    fontSize: '10.5px',
    lineHeight: '1',
    color: 'var(--text-faint)',
    background: 'var(--bg-elev)',
    border: '1px solid var(--border-soft)',
    borderRadius: '999px',
    padding: '3px 6px',
    userSelect: 'none'
  },

  '.cm-link': { color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent-line)', cursor: 'pointer' },
  '.cm-link-icon': {
    display: 'inline-flex',
    width: '0.92em',
    height: '0.92em',
    marginRight: '0.22em',
    verticalAlign: '-0.1em',
    color: 'var(--text-faint)'
  },
  '.cm-link-icon-external': { color: 'var(--accent)' },
  '.cm-link-icon svg': { width: '100%', height: '100%' },

  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '0.55em 0'
  },

  '.cm-task-checkbox': {
    appearance: 'none',
    width: '15px',
    height: '15px',
    margin: '0 0.45em 0 0',
    verticalAlign: '-2px',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    background: 'var(--bg)',
    cursor: 'pointer'
  },
  '.cm-task-checkbox:checked': {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    boxShadow: 'inset 0 0 0 3px var(--bg)'
  },

  '.cm-list-bullet': {
    display: 'inline-block',
    minWidth: '1.2em',
    color: 'var(--text)',
    fontWeight: '600',
    marginRight: '0.4em',
    textAlign: 'right',
    userSelect: 'none'
  },
  '.cm-list-bullet-nested': {
    position: 'relative'
  },
  '.cm-list-bullet-nested::before': {
    content: "''",
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: 'calc(-1 * var(--list-level) * 1.2em + 0.3em)',
    borderLeft: '1px solid var(--border-soft)',
    opacity: '0.6',
    pointerEvents: 'none'
  },

  '.cm-frontmatter': {
    fontFamily: MONO,
    fontSize: '0.82em',
    color: 'var(--text-dim)'
  },

  '.cm-table-wrap': {
    overflowX: 'auto',
    margin: '8px 0',
    border: '1px solid var(--border-soft)',
    borderRadius: 'var(--r)',
    background: 'var(--bg-elev)'
  },
  '.cm-table-render': {
    borderCollapse: 'separate',
    borderSpacing: '0',
    width: '100%',
    minWidth: '420px',
    fontSize: '13.5px',
    lineHeight: '1.45'
  },
  '.cm-table-render th, .cm-table-render td': {
    borderRight: '1px solid var(--border-soft)',
    borderBottom: '1px solid var(--border-soft)',
    padding: '5px 8px',
    textAlign: 'left',
    minWidth: '72px'
  },
  '.cm-table-render th:last-child, .cm-table-render td:last-child': { borderRight: 'none' },
  '.cm-table-render tbody tr:last-child td': { borderBottom: 'none' },
  '.cm-table-render th': {
    background: 'var(--bg-panel)',
    color: 'var(--text-dim)',
    fontWeight: '600'
  },
  '.cm-table-render td:focus, .cm-table-render th:focus': {
    outline: '2px solid var(--accent-line)',
    outlineOffset: '-2px',
    background: 'var(--accent-soft)'
  },

  '.cm-table-toolbar': {
    display: 'none',
    gap: '4px',
    padding: '5px',
    borderTop: '1px solid var(--border-soft)',
    background: 'var(--bg)'
  },
  '.cm-table-wrap:hover .cm-table-toolbar': {
    display: 'flex'
  },
  '.cm-table-toolbar button': {
    fontSize: '11.5px',
    lineHeight: '1.2',
    padding: '3px 7px',
    border: '1px solid var(--border-soft)',
    borderRadius: '5px',
    background: 'var(--bg-panel)',
    cursor: 'pointer',
    color: 'var(--text-dim)'
  },
  '.cm-table-toolbar button:hover': {
    background: 'var(--bg-hover)',
    color: 'var(--text)'
  },

  '.cm-table-render td.cm-table-last-cell': {
    position: 'relative',
    paddingRight: '34px'
  },
  '.cm-table-row-del': {
    position: 'absolute',
    top: '50%',
    right: '6px',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    lineHeight: '1',
    color: 'var(--text-faint)',
    background: 'var(--bg-elev)',
    border: '1px solid var(--border-soft)',
    borderRadius: '5px',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.12s, background 0.1s, color 0.1s, border-color 0.1s',
    padding: '0'
  },
  '.cm-table-row-del svg': {
    width: '13px',
    height: '13px'
  },
  '.cm-table-render tbody tr:hover .cm-table-row-del': {
    opacity: '1'
  },
  '.cm-table-row-del:hover': {
    background: 'var(--bg-hover)',
    borderColor: 'var(--accent-line)',
    color: 'var(--accent)'
  },

  '.cm-properties': {
    border: '1px solid var(--border-soft)',
    borderRadius: 'var(--r)',
    background: 'var(--bg-elev)',
    padding: '7px 8px',
    margin: '0 0 10px',
    fontSize: '13px',
    lineHeight: '1.35'
  },
  '.cm-prop-row': {
    display: 'grid',
    gridTemplateColumns: '124px minmax(0, 1fr) 20px',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0'
  },
  '.cm-prop-key': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: '500',
    minWidth: '0',
    padding: '3px 5px',
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
    fontSize: '1em',
    lineHeight: '1'
  },
  '.cm-prop-row:hover .cm-prop-del': { opacity: '1' },
  '.cm-prop-add': {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '3px 5px',
    marginTop: '2px'
  },
  '.cm-prop-add:hover': { color: 'var(--accent)' },

  '.cm-image-wrap': { display: 'block', maxWidth: '100%' },
  '.cm-image-wrap img': {
    maxWidth: '100%',
    borderRadius: '6px',
    display: 'block',
    margin: '6px auto'
  },
  '.cm-image-error': {
    color: 'var(--text-faint)',
    fontSize: '13px',
    fontStyle: 'italic'
  },

  '.cm-media-wrap': {
    display: 'block',
    margin: '12px 0',
    maxWidth: '100%'
  },
  '.cm-media-control': {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    minHeight: '48px',
    borderRadius: '8px',
    background: 'var(--bg-elev)',
    pointerEvents: 'auto'
  },
  '.cm-media-status': {
    display: 'block',
    marginTop: '6px',
    color: 'var(--text-dim)',
    fontSize: '12px',
    lineHeight: 1.5
  },
  '.cm-media-status-error': {
    color: 'var(--red)'
  },

  '.cm-footnote-ref': {
    color: 'var(--accent)',
    fontSize: '11px',
    cursor: 'default',
    padding: '0 1px'
  },

  '.cm-wiki-link': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.22em',
    color: 'var(--accent)',
    cursor: 'pointer',
    textDecoration: 'none',
    borderBottom: '1px solid var(--accent-line)',
    fontSize: '0.96em',
    lineHeight: '1.1',
    verticalAlign: '-0.08em',
    transition: 'opacity 0.1s, border-color 0.1s'
  },
  '.cm-wiki-link-glyph': {
    display: 'inline-flex',
    width: '0.92em',
    height: '0.92em',
    color: 'var(--text-faint)'
  },
  '.cm-wiki-link-glyph svg': {
    width: '100%',
    height: '100%'
  },
  '.cm-wiki-link:hover': {
    opacity: '0.82',
    borderColor: 'var(--accent)'
  },

  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },

  '.cm-line': {
    padding: '0.5px 0'
  }
})
