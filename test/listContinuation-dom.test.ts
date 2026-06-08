// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { listContinuation } from '@/editor/listContinuation'

let view: EditorView | null = null

function mount(doc: string, caret: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [
      markdown({ base: markdownLanguage }),
      // Same precedence ordering as the real editor: list continuation first.
      listContinuation,
      keymap.of(defaultKeymap)
    ]
  })
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({ state, parent })
}

/** Fire the keymap chain for an Enter keydown, as CodeMirror does at runtime. */
function pressEnter(v: EditorView): boolean {
  const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' })
  return runScopeHandlers(v, ev, 'editor')
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe('list continuation — Enter behavior (integration)', () => {
  it('continues a bullet list on Enter', () => {
    const doc = '- apple'
    view = mount(doc, doc.length)
    expect(pressEnter(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- apple\n- ')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('increments an ordered list on Enter', () => {
    const doc = '1. one\n2. two'
    view = mount(doc, doc.length)
    expect(pressEnter(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. ')
  })

  it('continues a task list with a fresh unchecked checkbox', () => {
    const doc = '- [x] done'
    view = mount(doc, doc.length)
    expect(pressEnter(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- [x] done\n- [ ] ')
  })

  it('exits the list when Enter is pressed on an empty item', () => {
    const doc = '- '
    view = mount(doc, doc.length)
    expect(pressEnter(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('')
  })

  it('falls through to the default newline outside a list', () => {
    const doc = 'plain text'
    view = mount(doc, doc.length)
    pressEnter(view)
    expect(view.state.doc.toString()).toBe('plain text\n')
  })
})
