import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting } from '@codemirror/language'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { listContinuation } from '@/editor/listContinuation'
import { marginEditorTheme } from '@/editor/livePreview/theme'
import { marginHighlightStyle } from '@/editor/livePreview/highlightStyle'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'
import { slashInsertedAt } from '@/editor/slashTrigger'

interface EditorProps {
  docKey: string | null
  initialValue: string
  onChange: (value: string) => void
  onSave: () => void
}

export interface EditorHandle {
  jumpToLine: (line: number) => void
}

/**
 * Offset of the first body character after a leading YAML frontmatter block,
 * or 0 if the document has none. Used to place the initial cursor below the
 * frontmatter so the properties panel renders instead of revealing raw YAML.
 */
function bodyStart(doc: string): number {
  const lines = doc.split('\n')
  if (lines[0] !== '---') return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      // Offset just past the closing `---` line and its trailing newline.
      const through = lines.slice(0, i + 1).join('\n').length + 1
      return Math.min(through, doc.length)
    }
  }
  return 0
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { docKey, initialValue, onChange, onSave },
  ref
): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const retryRafRef = useRef<number | null>(null)

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

  // 在事务确认 "/" 已插入后再测量坐标；测量落空（如尚未布局）下一帧重试一次，
  // 不再静默失败。
  const openSlashMenuAt = useCallback((view: EditorView, pos: number) => {
    const place = (): boolean => {
      const coords = view.coordsAtPos(pos)
      if (!coords) return false
      setSlashMenu({ x: coords.left, y: coords.bottom + 4, from: pos })
      return true
    }
    view.requestMeasure({
      read: () => null,
      write: () => {
        if (!place()) retryRafRef.current = requestAnimationFrame(() => place())
      }
    })
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

    const state = EditorState.create({
      doc: initialValue,
      // Start the cursor below any frontmatter so the properties panel renders
      // (Obsidian-style) instead of opening as revealed raw YAML.
      selection: { anchor: bodyStart(initialValue) },
      extensions: [
        history(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(marginHighlightStyle, { fallback: true }),
        livePreview,
        marginEditorTheme,
        EditorView.lineWrapping,
        saveKeymap,
        // List continuation must outrank the default Enter (insertNewline).
        listContinuation,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
          for (const tr of update.transactions) {
            const pos = slashInsertedAt(tr)
            if (pos != null) openSlashMenuAt(update.view, pos)
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
      if (retryRafRef.current != null) cancelAnimationFrame(retryRafRef.current)
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
