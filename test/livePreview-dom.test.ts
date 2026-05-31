// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'
import { marginEditorTheme } from '@/editor/livePreview/theme'

const ALL_FEATURES = [
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

describe('livePreview ViewPlugin — DOM smoke', () => {
  it('mounts an all-features document without throwing', () => {
    expect(() => {
      view = mount(ALL_FEATURES, 0)
    }).not.toThrow()
    expect(view!.dom.querySelectorAll('.cm-line').length).toBeGreaterThan(0)
  })

  it('renders heading and code-block line decorations', () => {
    view = mount(ALL_FEATURES, 200) // cursor near end, away from the heading
    expect(view.dom.querySelector('.cm-heading')).not.toBeNull()
    expect(view.dom.querySelector('.cm-code-block')).not.toBeNull()
  })

  it('renders the hr and checkbox widgets', () => {
    view = mount(ALL_FEATURES, 0) // cursor on heading line, away from hr/tasks
    expect(view.dom.querySelector('hr.cm-hr')).not.toBeNull()
    expect(view.dom.querySelector('input.cm-task-checkbox')).not.toBeNull()
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
