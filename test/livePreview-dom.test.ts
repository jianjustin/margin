// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, Decoration } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { marginEditorTheme } from '@/editor/livePreview/theme'

const ALL_FEATURES = [
  '---',
  'title: Doc',
  'tags: a, b',
  '---',
  '',
  '# Heading One',
  '',
  'Some **bold**, *italic*, ~~struck~~, and `inline code` text.',
  '',
  '> A blockquote line.',
  '',
  '- [x] done task',
  '- [ ] pending task',
  '',
  'A [link](https://example.com) in a sentence.',
  '',
  'A [[Target Note]] wiki link in a sentence.',
  '',
  '---',
  '',
  '```js',
  'const x = 1',
  '```'
].join('\n')

let view: EditorView | null = null

function mount(doc: string, selectionAt = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: selectionAt },
    extensions: [markdown({ base: markdownLanguage }), livePreview, marginEditorTheme]
  })
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({ state, parent })
}

afterEach(() => {
  view?.destroy()
  view = null
})

// Stable offsets into ALL_FEATURES for placing the cursor.
const bodyPos = ALL_FEATURES.indexOf('italic') // in prose, away from rich blocks
const codePos = ALL_FEATURES.indexOf('const x') // inside the fenced code block
const fmPos = ALL_FEATURES.indexOf('title:') // inside the frontmatter

describe('livePreview StateField — DOM smoke', () => {
  it('mounts an all-features document without throwing', () => {
    expect(() => {
      view = mount(ALL_FEATURES, 0)
    }).not.toThrow()
    expect(view!.dom.querySelectorAll('.cm-line').length).toBeGreaterThan(0)
  })

  it('renders heading decoration and the fenced-code widget when cursor is away', () => {
    view = mount(ALL_FEATURES, bodyPos)
    expect(view.dom.querySelector('.cm-heading')).not.toBeNull()
    // Code block is replaced by the scrollable render widget (not raw lines).
    expect(view.dom.querySelector('.cm-code-render')).not.toBeNull()
    expect(view.dom.querySelector('.cm-code-block')).toBeNull()
  })

  it('reveals raw code lines when the cursor enters the fence', () => {
    view = mount(ALL_FEATURES, codePos)
    expect(view.dom.querySelector('.cm-code-block')).not.toBeNull()
    expect(view.dom.querySelector('.cm-code-render')).toBeNull()
  })

  it('renders the hr and checkbox widgets', () => {
    view = mount(ALL_FEATURES, bodyPos) // cursor away from hr/tasks
    expect(view.dom.querySelector('hr.cm-hr')).not.toBeNull()
    expect(view.dom.querySelector('.cm-task-checkbox')).not.toBeNull()
  })

  it('dispatches a wiki-link event from a paragraph wiki widget', () => {
    view = mount(ALL_FEATURES, bodyPos)
    const opened: string[] = []
    view.dom.addEventListener('margin-open-link', (event) => {
      opened.push((event as CustomEvent<string>).detail)
    })
    const link = view.dom.querySelector('.cm-wiki-link') as HTMLElement
    expect(link).not.toBeNull()
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(opened).toEqual(['wiki:Target Note'])
  })

  it('renders frontmatter as an editable properties panel when cursor is away', () => {
    view = mount(ALL_FEATURES, bodyPos)
    expect(view.dom.querySelector('.cm-properties')).not.toBeNull()
    expect(view.dom.querySelector('.cm-frontmatter')).toBeNull()
  })

  it('reveals raw frontmatter lines when the cursor enters the region', () => {
    view = mount(ALL_FEATURES, fmPos)
    expect(view.dom.querySelector('.cm-frontmatter')).not.toBeNull()
    expect(view.dom.querySelector('.cm-properties')).toBeNull()
  })

  it('does not throw when the selection moves across every line', () => {
    view = mount(ALL_FEATURES, 0)
    expect(() => {
      for (let pos = 0; pos <= ALL_FEATURES.length; pos += 5) {
        view!.dispatch({ selection: { anchor: pos } })
      }
    }).not.toThrow()
  })
})

describe('livePreview image decoration model', () => {
  it('standalone image: no block-replace covering image line; block widget at line end', () => {
    const imgDoc = 'para\n\n![alt](pic.png)\n\nmore'
    const imgPos = imgDoc.indexOf('![alt]')
    const imgState = EditorState.create({
      doc: imgDoc,
      selection: { anchor: 0 },
      extensions: [markdown({ base: markdownLanguage }), livePreview, marginEditorTheme]
    })
    const deco = imgState.field(livePreview).deco
    const imgLine = imgState.doc.lineAt(imgPos)

    let hasBlockReplaceCoveringImageLine = false
    let hasBlockWidgetAtLineEnd = false

    deco.between(0, imgDoc.length, (from, to, d) => {
      const spec = (d as Decoration & { spec: { block?: boolean; widget?: unknown } }).spec
      // Check for block-type replace decoration that covers the image line
      if (spec.block && !spec.widget) {
        // This is a block line decoration, skip
      } else if (spec.block && spec.widget) {
        // Block widget: check if it's at line end (side widget)
        if (from === imgLine.to && to === imgLine.to) {
          hasBlockWidgetAtLineEnd = true
        }
        // A block replace that covers the image line's content is the old bad behavior
        if (from <= imgPos && to >= imgLine.to) {
          hasBlockReplaceCoveringImageLine = true
        }
      }
    })

    expect(hasBlockReplaceCoveringImageLine).toBe(false)
    expect(hasBlockWidgetAtLineEnd).toBe(true)
  })

  it('standalone image at doc end without trailing newline: no block-replace covering image line; block widget at line end', () => {
    const imgDoc = 'para\n![a](pic.png)'
    const imgPos = imgDoc.indexOf('![a]')
    const imgState = EditorState.create({
      doc: imgDoc,
      selection: { anchor: 0 },
      extensions: [markdown({ base: markdownLanguage }), livePreview, marginEditorTheme]
    })
    const deco = imgState.field(livePreview).deco
    const imgLine = imgState.doc.lineAt(imgPos)

    let hasBlockReplaceCoveringImageLine = false
    let hasBlockWidgetAtLineEnd = false

    deco.between(0, imgDoc.length, (from, to, d) => {
      const spec = (d as Decoration & { spec: { block?: boolean; widget?: unknown } }).spec
      // Check for block-type replace decoration that covers the image line
      if (spec.block && !spec.widget) {
        // This is a block line decoration, skip
      } else if (spec.block && spec.widget) {
        // Block widget: check if it's at line end (side widget)
        if (from === imgLine.to && to === imgLine.to) {
          hasBlockWidgetAtLineEnd = true
        }
        // A block replace that covers the image line's content is the old bad behavior
        if (from <= imgPos && to >= imgLine.to) {
          hasBlockReplaceCoveringImageLine = true
        }
      }
    })

    expect(hasBlockReplaceCoveringImageLine).toBe(false)
    expect(hasBlockWidgetAtLineEnd).toBe(true)
  })
})
