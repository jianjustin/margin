import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting } from '@codemirror/language'
import { livePreview, livePreviewAtomicRanges } from '@/editor/livePreview/livePreviewPlugin'
import { linkUrlAt } from '@/editor/livePreview/linkAt'
import { docPathFacet, vaultRootFacet } from '@/editor/docPathFacet'
import { listContinuation } from '@/editor/listContinuation'
import { inlineMarkCommands } from '@/editor/commands/inlineMarkKeymap'
import { blockCommands } from '@/editor/commands/blockKeymap'
import { marginEditorTheme } from '@/editor/livePreview/theme'
import { marginHighlightStyle } from '@/editor/livePreview/highlightStyle'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'
import { slashInsertedAt } from '@/editor/slashTrigger'
import { api } from '@/lib/api'
import { richContentConfigFacet } from '@/editor/livePreview/richContent'

interface EditorProps {
  docKey: string | null
  initialValue: string
  onChange: (value: string) => void
  onSave: () => void
  onOpenLink?: (url: string) => void
  onAssetImported?: () => void
  filePath?: string | null
  vaultRoot?: string | null
  assetsDir?: string
  plantUmlServerUrl?: string
  diagramFitWidth?: boolean
  mathEnabled?: boolean
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
  {
    docKey,
    initialValue,
    onChange,
    onSave,
    onOpenLink,
    onAssetImported,
    filePath = null,
    vaultRoot = null,
    assetsDir = 'assets',
    plantUmlServerUrl = 'https://kroki.io',
    diagramFitWidth = true,
    mathEnabled = true
  },
  ref
): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const retryRafRef = useRef<number | null>(null)

  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onOpenLinkRef = useRef(onOpenLink)
  const onAssetImportedRef = useRef(onAssetImported)
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onOpenLinkRef.current = onOpenLink
  onAssetImportedRef.current = onAssetImported

  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; from: number } | null>(null)
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const previewDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

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

  const insertAtSelection = useCallback((markdown: string): void => {
    const view = viewRef.current
    if (!view) return
    const range = view.state.selection.main
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: markdown },
      selection: { anchor: range.from + markdown.length }
    })
    view.focus()
  }, [])

  const importImageFile = useCallback(async (file: File, sourcePath?: string): Promise<void> => {
    const root = vaultRoot
    if (!root) return
    const rel = sourcePath
      ? await api.importAssetFromPath(root, sourcePath, assetsDir)
      : await api.writeAssetBytes(
          root,
          file.name || `pasted-${Date.now()}.${extensionForImage(file)}`,
          Array.from(new Uint8Array(await file.arrayBuffer())),
          assetsDir
        )
    const alt = (file.name || 'image').replace(/\.[^.]+$/, '')
    insertAtSelection(`![${alt}](${rel})`)
    onAssetImportedRef.current?.()
  }, [assetsDir, insertAtSelection, vaultRoot])

  const importDataTransferImages = useCallback((files: FileList | null): boolean => {
    if (!files || files.length === 0) return false
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return false
    for (const file of images) {
      const sourcePath = (file as File & { path?: string }).path
      void importImageFile(file, sourcePath).catch(() => {})
    }
    return true
  }, [importImageFile])

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
        docPathFacet.of(filePath),
        vaultRootFacet.of(vaultRoot),
        richContentConfigFacet.of({ assetsDir, plantUmlServerUrl, diagramFitWidth, mathEnabled }),
        livePreview,
        livePreviewAtomicRanges,
        marginEditorTheme,
        EditorView.lineWrapping,
        saveKeymap,
        EditorView.domEventHandlers({
          mousedown: (e, view) => {
            if (!(e.metaKey || e.ctrlKey)) return false
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
            if (pos == null) return false
            const url = linkUrlAt(view.state, pos)
            if (!url) return false
            e.preventDefault()
            onOpenLinkRef.current?.(url)
            return true
          },
          drop: (e) => {
            const handled = importDataTransferImages(e.dataTransfer?.files ?? null)
            if (!handled) return false
            e.preventDefault()
            return true
          },
          paste: (e) => {
            const items = Array.from(e.clipboardData?.items ?? [])
            const imageItem = items.find((item) => item.type.startsWith('image/'))
            const file = imageItem?.getAsFile()
            if (!file) return false
            e.preventDefault()
            void importImageFile(file).catch(() => {})
            return true
          }
        }),
        // Inline-formatting shortcuts (⌘B/⌘I/…) must outrank the default keymap.
        inlineMarkCommands,
        // Block formatting + line moves (headings, lists, quote, move/duplicate).
        blockCommands,
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
          '&': { height: '100%', fontSize: '14px' },
          '.cm-content': {
            maxWidth: '600px',
            margin: '0 auto',
            padding: 'clamp(78px, 9vh, 92px) 0 168px',
            fontFamily: 'var(--editor)',
            lineHeight: '1.68'
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    const host = hostRef.current
    const handleWidgetOpenLink = (event: Event): void => {
      const url = (event as CustomEvent<string>).detail
      if (url) onOpenLinkRef.current?.(url)
    }
    host.addEventListener('margin-open-link', handleWidgetOpenLink as EventListener)
    const handleImagePreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ src: string; alt: string }>).detail
      if (!detail?.src) return
      setPreviewScale(1)
      setPreviewOffset({ x: 0, y: 0 })
      setImagePreview(detail)
    }
    host.addEventListener('margin-open-image-preview', handleImagePreview as EventListener)

    return () => {
      if (retryRafRef.current != null) cancelAnimationFrame(retryRafRef.current)
      host.removeEventListener('margin-open-link', handleWidgetOpenLink as EventListener)
      host.removeEventListener('margin-open-image-preview', handleImagePreview as EventListener)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, filePath, plantUmlServerUrl, diagramFitWidth, mathEnabled, importDataTransferImages, importImageFile])

  return (
    <>
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {imagePreview && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[oklch(0_0_0/0.72)]"
          onClick={() => setImagePreview(null)}
          onWheel={(e) => {
            e.preventDefault()
            setPreviewScale((value) => Math.min(5, Math.max(0.25, value + (e.deltaY < 0 ? 0.1 : -0.1))))
          }}
        >
          <img
            src={imagePreview.src}
            alt={imagePreview.alt}
            draggable={false}
            className="max-h-[88vh] max-w-[88vw] cursor-grab select-none rounded-md shadow-[0_24px_72px_oklch(0_0_0/0.5)] active:cursor-grabbing"
            style={{
              transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`,
              transformOrigin: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              ;(e.currentTarget as HTMLImageElement).setPointerCapture(e.pointerId)
              previewDragRef.current = { x: e.clientX, y: e.clientY, ox: previewOffset.x, oy: previewOffset.y }
            }}
            onPointerMove={(e) => {
              const drag = previewDragRef.current
              if (!drag) return
              setPreviewOffset({ x: drag.ox + e.clientX - drag.x, y: drag.oy + e.clientY - drag.y })
            }}
            onPointerUp={() => {
              previewDragRef.current = null
            }}
          />
        </div>
      )}
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

function extensionForImage(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]
  if (fromName) return fromName.toLowerCase()
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'png'
}
