import { EditorView } from '@codemirror/view'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * Visual styling for the editor + live-preview decoration classes.
 *
 * Marked `{ dark: true }` so CodeMirror uses light-on-dark base defaults; the
 * caret and selection are also set explicitly to theme colors so the cursor is
 * visible on the dark background (CM's default caret is near-black).
 */
export const marginEditorTheme = EditorView.theme(
  {
    // Caret: native (contenteditable) caret color + CM's own cursor element.
    '.cm-content': { caretColor: 'hsl(var(--foreground))' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },

    // Selection (warm-gold tint), for both native and drawn selection.
    '.cm-content ::selection': { backgroundColor: 'hsl(var(--primary) / 0.25)' },
    '.cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.25)' },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'hsl(var(--primary) / 0.30)'
    },

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

    '.cm-task-checkbox': { marginRight: '0.4em', verticalAlign: 'middle' },

    // YAML frontmatter: muted, monospace metadata block (not headings).
    '.cm-frontmatter': {
      fontFamily: MONO,
      fontSize: '0.85em',
      color: 'hsl(var(--muted-foreground))'
    }
  },
  { dark: true }
)
