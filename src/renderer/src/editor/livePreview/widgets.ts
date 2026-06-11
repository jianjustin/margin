import { WidgetType, type EditorView } from '@codemirror/view'
import { convertFileSrc } from '@tauri-apps/api/core'
import { findLanguage, highlightInto } from './codeHighlight'
import { parseTable, serializeTable, type Align } from './tableModel'
import { parseFrontmatter, serializeFrontmatter, type FmField } from './frontmatterModel'

/** Renders a task-list checkbox replacing the raw `[ ]` / `[x]` token. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task-checkbox'
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return box
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Renders an <hr> replacing a `---` / `***` horizontal-rule line. */
export class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    return hr
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Renders a fenced code block as a horizontally-scrollable, syntax-highlighted
 * <pre>. Read-only render view; the live-preview plugin reveals raw editable
 * lines when the cursor enters the fence region.
 */
export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly info: string
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return other.code === this.code && other.info === this.info
  }

  toDOM(): HTMLElement {
    const pre = document.createElement('pre')
    pre.className = 'cm-code-render'
    if (this.info) {
      const tag = document.createElement('span')
      tag.className = 'cm-code-lang'
      tag.textContent = this.info
      pre.appendChild(tag)
    }
    const codeEl = document.createElement('code')
    codeEl.textContent = this.code
    pre.appendChild(codeEl)

    const desc = findLanguage(this.info)
    if (desc) {
      if (desc.support) {
        highlightInto(codeEl, this.code, desc.support)
      } else {
        void desc.load().then((support) => {
          // DOM may have been replaced; guard with isConnected.
          if (codeEl.isConnected) highlightInto(codeEl, this.code, support)
        })
      }
    }
    return pre
  }

  ignoreEvent(): boolean {
    return true
  }
}

const ALIGN_CSS: Record<Exclude<Align, null>, string> = {
  left: 'left',
  center: 'center',
  right: 'right'
}

/**
 * Renders a GFM table as an editable HTML <table>. Cells are contenteditable;
 * edits commit on blur / compositionend (IME-safe) by re-serializing the model
 * and dispatching a source replacement over [from, to]. The live-preview
 * StateField reveals raw markdown when the cursor enters the table region.
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const model = parseTable(this.source)
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap'
    const table = document.createElement('table')
    table.className = 'cm-table-render'

    let composing = false

    const commit = (): void => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.textContent ?? '')
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).map((c) => c.textContent ?? '')
      )
      const next = serializeTable({ header, align: model.align, rows })
      if (next === this.source) return
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } })
    }

    const wireCell = (td: HTMLTableCellElement, align: Align): void => {
      td.contentEditable = 'true'
      td.spellcheck = false
      if (align) td.style.textAlign = ALIGN_CSS[align]
      td.addEventListener('compositionstart', () => {
        composing = true
      })
      td.addEventListener('compositionend', () => {
        composing = false
        commit()
      })
      td.addEventListener('blur', () => {
        if (!composing) commit()
      })
    }

    const thead = document.createElement('thead')
    const htr = document.createElement('tr')
    model.header.forEach((cell, i) => {
      const th = document.createElement('th')
      th.textContent = cell
      wireCell(th, model.align[i] ?? null)
      htr.appendChild(th)
    })
    thead.appendChild(htr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    model.rows.forEach((row) => {
      const tr = document.createElement('tr')
      model.header.forEach((_, i) => {
        const td = document.createElement('td')
        td.textContent = row[i] ?? ''
        wireCell(td, model.align[i] ?? null)
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    wrap.appendChild(table)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Renders frontmatter as an editable Obsidian-style properties panel. Replaces
 * the `---...---` region. Field edits commit on blur/change/compositionend by
 * re-serializing to YAML and dispatching a source replacement. The live-preview
 * StateField reveals raw YAML when the cursor enters the region.
 */
export class PropertiesWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: PropertiesWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const fields = parseFrontmatter(this.source)
    const root = document.createElement('div')
    root.className = 'cm-properties'

    let composing = false

    const commit = (next: FmField[]): void => {
      const insert = serializeFrontmatter(next)
      if (insert === this.source) return
      view.dispatch({ changes: { from: this.from, to: this.to, insert } })
    }

    const buildValueControl = (field: FmField, idx: number): HTMLElement => {
      const setVal = (value: unknown): void => {
        const next = [...fields]
        next[idx] = { ...field, value }
        commit(next)
      }
      if (field.type === 'checkbox') {
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.checked = Boolean(field.value)
        box.addEventListener('change', () => setVal(box.checked))
        return box
      }
      if (field.type === 'list') {
        const input = document.createElement('input')
        input.className = 'cm-prop-input'
        input.value = (Array.isArray(field.value) ? field.value : []).join(', ')
        const commitList = (): void =>
          setVal(
            input.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        input.addEventListener('compositionstart', () => {
          composing = true
        })
        input.addEventListener('compositionend', () => {
          composing = false
          commitList()
        })
        input.addEventListener('blur', () => {
          if (!composing) commitList()
        })
        return input
      }
      const input = document.createElement('input')
      input.className = 'cm-prop-input'
      input.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
      input.value = field.value == null ? '' : String(field.value)
      const commitText = (): void => {
        if (composing) return
        const raw = input.value
        setVal(field.type === 'number' ? Number(raw) : raw)
      }
      input.addEventListener('compositionstart', () => {
        composing = true
      })
      input.addEventListener('compositionend', () => {
        composing = false
        commitText()
      })
      input.addEventListener('blur', commitText)
      return input
    }

    const renderRow = (field: FmField, idx: number): HTMLElement => {
      const row = document.createElement('div')
      row.className = 'cm-prop-row'

      const keyEl = document.createElement('input')
      keyEl.className = 'cm-prop-key'
      keyEl.value = field.key
      keyEl.addEventListener('blur', () => {
        if (composing) return
        const next = [...fields]
        next[idx] = { ...field, key: keyEl.value }
        commit(next)
      })

      const valWrap = document.createElement('div')
      valWrap.className = 'cm-prop-val'
      valWrap.appendChild(buildValueControl(field, idx))

      const del = document.createElement('button')
      del.className = 'cm-prop-del'
      del.textContent = '×'
      del.title = 'Delete property'
      del.addEventListener('click', () => {
        commit(fields.filter((_, i) => i !== idx))
      })

      row.appendChild(keyEl)
      row.appendChild(valWrap)
      row.appendChild(del)
      return row
    }

    fields.forEach((f, i) => root.appendChild(renderRow(f, i)))

    const add = document.createElement('button')
    add.className = 'cm-prop-add'
    add.textContent = '+ 添加属性'
    add.addEventListener('click', () => {
      commit([...fields, { key: 'new-property', type: 'text', value: '' }])
    })
    root.appendChild(add)

    return root
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Natural-size cache so decoration rebuilds don't cause layout jumps. */
const imageDims = new Map<string, { w: number; h: number }>()

function toDisplayUrl(p: string): string {
  if (/^(https?:|data:|asset:)/i.test(p)) return p
  try {
    return convertFileSrc(p)
  } catch {
    return 'file://' + p // non-Tauri contexts (tests, demo harness)
  }
}

/** Renders `![alt](src)` as an inline image with graceful error fallback. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    /** Absolute path or external URL; null when unresolvable (no doc path). */
    readonly resolved: string | null
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.resolved === this.resolved
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    if (!this.resolved) return this.renderError(wrap)

    const url = toDisplayUrl(this.resolved)
    const img = document.createElement('img')
    img.alt = this.alt
    const dims = imageDims.get(url)
    if (dims) img.style.aspectRatio = `${dims.w} / ${dims.h}`
    img.addEventListener('load', () => {
      if (!wrap.isConnected) return
      if (!imageDims.has(url)) {
        imageDims.set(url, { w: img.naturalWidth, h: img.naturalHeight })
        view.requestMeasure()
      }
    })
    img.addEventListener('error', () => {
      if (!wrap.isConnected) return
      wrap.textContent = ''
      this.renderError(wrap)
      view.requestMeasure()
    })
    img.src = url
    wrap.appendChild(img)
    return wrap
  }

  private renderError(wrap: HTMLElement): HTMLElement {
    const ph = document.createElement('span')
    ph.className = 'cm-image-error'
    ph.textContent = `图片加载失败: ${this.alt || ''} (${this.src})`
    wrap.appendChild(ph)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}
