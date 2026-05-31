import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

interface EditorProps {
  /** Identifies the open document; changing it reloads the editor contents. */
  docKey: string | null
  /** Initial text for the current docKey. */
  initialValue: string
  /** Called on every edit with the full document text. */
  onChange: (value: string) => void
  /** Called when the user presses Cmd/Ctrl-S. */
  onSave: () => void
}

export function Editor({ docKey, initialValue, onChange, onSave }: EditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Keep the latest callbacks without re-creating the editor.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  // Create the EditorView once per docKey.
  useEffect(() => {
    if (!hostRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          onSaveRef.current()
          return true
        }
      }
    ])

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
        EditorView.lineWrapping,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '16px' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { maxWidth: '720px', margin: '0 auto', padding: '56px 40px' }
        })
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Re-create only when switching documents, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
