import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { marginEditorTheme } from '@/editor/livePreview/theme'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'

interface EditorProps {
  docKey: string | null
  initialValue: string
  onChange: (value: string) => void
  onSave: () => void
}

export interface EditorHandle {
  jumpToLine: (line: number) => void
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { docKey, initialValue, onChange, onSave },
  ref
): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; from: number } | null>(null)

  useImperativeHandle(ref, () => ({
    jumpToLine(line: number) {
      const view = viewRef.current
      if (!view) return
      const lineCount = view.state.doc.lines
      if (line < 0 || line >= lineCount) return
      const docLine = view.state.doc.line(line + 1)
      view.dispatch({
        selection: { anchor: docLine.from },
        effects: EditorView.scrollIntoView(docLine.from, { y: 'center' })
      })
      view.focus()
    }
  }))

  const handleSlashSelect = useCallback((item: SlashMenuItem) => {
    const view = viewRef.current
    if (!view || !slashMenu) return
    const from = slashMenu.from
    const to = view.state.selection.main.head
    view.dispatch({
      changes: { from: from - 1, to, insert: item.markdown },
      selection: { anchor: from - 1 + item.markdown.length }
    })
    setSlashMenu(null)
    view.focus()
  }, [slashMenu])

  const handleSlashClose = useCallback(() => {
    setSlashMenu(null)
    viewRef.current?.focus()
  }, [])

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

    const slashKeymap = keymap.of([
      {
        key: '/',
        run: (view) => {
          const pos = view.state.selection.main.head
          const line = view.state.doc.lineAt(pos)
          const textBefore = view.state.doc.sliceString(line.from, pos)
          if (textBefore.trim() === '') {
            setTimeout(() => {
              const coords = view.coordsAtPos(pos)
              if (coords) {
                setSlashMenu({ x: coords.left, y: coords.bottom + 4, from: pos + 1 })
              }
            }, 0)
          }
          return false
        }
      }
    ])

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        history(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreview,
        marginEditorTheme,
        EditorView.lineWrapping,
        slashKeymap,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '16px' },
          '.cm-content': {
            maxWidth: '720px',
            margin: '0 auto',
            padding: '56px 40px 240px',
            fontFamily: 'var(--ui)',
            lineHeight: '1.72'
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  return (
    <>
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {slashMenu && (
        <SlashMenu
          x={slashMenu.x}
          y={slashMenu.y}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
        />
      )}
    </>
  )
})
