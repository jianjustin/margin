import { WidgetType, type EditorView } from '@codemirror/view'
import { convertFileSrc } from '@tauri-apps/api/core'
import { findLanguage, highlightInto } from './codeHighlight'
import { parseTable, serializeTable, deleteTableRow, type Align } from './tableModel'
import { parseFrontmatter, serializeFrontmatter, type FmField } from './frontmatterModel'
import { createWikiLinkElement, renderInlineMarkdown } from './inlineMarkdown'
import type { DiagramKind } from './richContent'
import { api } from '@/lib/api'

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
    const box = document.createElement('span')
    box.className = 'cm-task-checkbox' + (this.checked ? ' cm-task-checkbox-on' : '')
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    if (this.checked) box.appendChild(checkSvg())
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return box
  }

  ignoreEvent(): boolean {
    return true
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

export class LinkIconWidget extends WidgetType {
  constructor(readonly kind: 'file' | 'external') {
    super()
  }

  eq(other: LinkIconWidget): boolean {
    return other.kind === this.kind
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = `cm-link-icon cm-link-icon-${this.kind}`
    wrap.setAttribute('aria-hidden', 'true')
    wrap.appendChild(this.kind === 'external' ? linkSvg() : fileSvg())
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

function baseSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  return svg
}

function path(d: string): SVGPathElement {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  return p
}

function checkSvg(): SVGSVGElement {
  const svg = baseSvg()
  svg.setAttribute('stroke-width', '3')
  svg.appendChild(path('M5 13l4 4L19 7'))
  return svg
}

function fileSvg(): SVGSVGElement {
  const svg = baseSvg()
  svg.appendChild(path('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'))
  svg.appendChild(path('M14 2v4a2 2 0 0 0 2 2h4'))
  return svg
}

function linkSvg(): SVGSVGElement {
  const svg = baseSvg()
  svg.appendChild(path('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'))
  svg.appendChild(path('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'))
  return svg
}

function trashSvg(): SVGSVGElement {
  const svg = baseSvg()
  svg.appendChild(path('M3 6h18'))
  svg.appendChild(path('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'))
  svg.appendChild(path('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'))
  svg.appendChild(path('M10 11v6'))
  svg.appendChild(path('M14 11v6'))
  return svg
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

const diagramCache = new Map<string, string>()
let mermaidSeq = 0

function renderDiagramFallback(root: HTMLElement, code: string, message: string): void {
  root.textContent = ''
  const error = document.createElement('div')
  error.className = 'cm-rich-error'
  error.textContent = message
  const pre = document.createElement('pre')
  pre.className = 'cm-code-render cm-diagram-fallback'
  const codeEl = document.createElement('code')
  codeEl.textContent = code
  pre.appendChild(codeEl)
  root.append(error, pre)
}

export class DiagramWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly kind: string,
    readonly serverUrl: string,
    readonly fitWidth: boolean
  ) {
    super()
  }

  eq(other: DiagramWidget): boolean {
    return (
      other.code === this.code &&
      other.kind === this.kind &&
      other.serverUrl === this.serverUrl &&
      other.fitWidth === this.fitWidth
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = ['cm-diagram-render', this.fitWidth ? 'cm-diagram-fit' : 'cm-diagram-scroll'].join(' ')
    root.dataset.diagramKind = this.kind

    const status = document.createElement('div')
    status.className = 'cm-diagram-status'
    status.textContent = 'Rendering diagram...'
    root.appendChild(status)

    if (this.kind === 'mermaid') {
      void this.renderMermaid(root, view)
    } else {
      void this.renderRemote(root, view)
    }
    return root
  }

  private async renderMermaid(root: HTMLElement, view: EditorView): Promise<void> {
    const key = `mermaid:${this.code}`
    const cached = diagramCache.get(key)
    if (cached) {
      root.innerHTML = cached
      return
    }
    try {
      const mod = await import('mermaid')
      const mermaid = mod.default
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })
      const id = `margin-mermaid-${++mermaidSeq}`
      const result = await mermaid.render(id, this.code)
      if (!root.isConnected) return
      diagramCache.set(key, result.svg)
      root.innerHTML = result.svg
      view.requestMeasure()
    } catch (error) {
      if (!root.isConnected) return
      renderDiagramFallback(root, this.code, error instanceof Error ? error.message : 'Mermaid render failed')
      view.requestMeasure()
    }
  }

  private async renderRemote(root: HTMLElement, view: EditorView): Promise<void> {
    const kind = this.kind as DiagramKind
    const key = `${this.serverUrl}:${kind}:${this.code}`
    const cached = diagramCache.get(key)
    if (cached) {
      root.innerHTML = cached
      return
    }
    try {
      const svg = await api.renderRemoteDiagram(this.serverUrl, kind, this.code)
      if (!root.isConnected) return
      diagramCache.set(key, svg)
      root.innerHTML = svg
      view.requestMeasure()
    } catch (error) {
      if (!root.isConnected) return
      renderDiagramFallback(
        root,
        this.code,
        error instanceof Error ? `图表渲染失败: ${error.message}` : '图表渲染失败'
      )
      view.requestMeasure()
    }
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

    const openWikiLink = (target: string): void => {
      wrap.dispatchEvent(
        new CustomEvent('margin-open-link', {
          detail: `wiki:${target}`,
          bubbles: true,
          composed: true
        })
      )
    }

    const renderCellDisplay = (
      td: HTMLTableCellElement,
      rawText: string,
      onDelete?: () => void
    ): void => {
      td.innerHTML = ''
      td.appendChild(renderInlineMarkdown(rawText, { onWikiLinkClick: openWikiLink }))

      if (!onDelete) return
      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'cm-table-row-del'
      delBtn.title = '删除此行'
      delBtn.setAttribute('aria-label', '删除此行')
      delBtn.contentEditable = 'false'
      delBtn.appendChild(trashSvg())
      delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onDelete()
      })
      td.appendChild(delBtn)
    }

    const commit = (): void => {
      const rawOf = (c: HTMLTableCellElement): string =>
        c === document.activeElement
          ? (c.textContent ?? '')
          : (c.dataset.raw ?? '')
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => rawOf(c))
      const colCount = header.length
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).slice(0, colCount).map((c) => rawOf(c))
      )
      const next = serializeTable({ header, align: model.align, rows })
      if (next === this.source) return
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } })
    }

    const wireCell = (
      td: HTMLTableCellElement,
      rawText: string,
      align: Align,
      onDelete?: () => void
    ): void => {
      td.contentEditable = 'true'
      td.spellcheck = false
      td.dataset.raw = rawText
      if (align) td.style.textAlign = ALIGN_CSS[align]
      if (onDelete) td.classList.add('cm-table-last-cell')

      // Initial render: show inline Markdown HTML
      renderCellDisplay(td, rawText, onDelete)

      td.addEventListener('focus', () => {
        // Switch to raw text for editing (Typora-style reveal)
        td.textContent = td.dataset.raw ?? ''
      })
      let justComposed = false
      td.addEventListener('compositionstart', () => { composing = true })
      td.addEventListener('compositionend', () => {
        composing = false
        justComposed = true
        td.dataset.raw = td.textContent ?? ''
        commit()
        const raw = td.dataset.raw ?? ''
        renderCellDisplay(td, raw, onDelete)
      })
      td.addEventListener('blur', () => {
        if (justComposed) { justComposed = false; return }
        if (!composing) {
          td.dataset.raw = td.textContent ?? ''
          commit()
        }
        const raw = td.dataset.raw ?? ''
        renderCellDisplay(td, raw, onDelete)
      })
      td.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return
        e.preventDefault()
        const cells = Array.from(table.querySelectorAll('th, td:not(.cm-table-row-del-cell)')) as HTMLElement[]
        const idx = cells.indexOf(td)
        const next = e.shiftKey ? idx - 1 : idx + 1
        if (next >= 0 && next < cells.length) {
          cells[next].focus()
        } else if (!e.shiftKey && next >= cells.length) {
          const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
          const rawOrLive = (c: HTMLTableCellElement): string =>
            c === td ? (c.textContent ?? '') : (c.dataset.raw ?? '')
          const header = headCells.map((c) => rawOrLive(c))
          const colCount = header.length
          const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
            Array.from(r.cells).slice(0, colCount).map((c) => rawOrLive(c))
          )
          rows.push(header.map(() => ''))
          const insert = serializeTable({ header, align: model.align, rows })
          if (insert !== this.source) {
            view.dispatch({ changes: { from: this.from, to: this.to, insert } })
          }
          requestAnimationFrame(() => {
            const newCells = Array.from(table.querySelectorAll<HTMLElement>('td:not(.cm-table-row-del-cell)'))
            const target = newCells[newCells.length - header.length]
            if (target) target.focus()
          })
        }
      })
    }

    const thead = document.createElement('thead')
    const htr = document.createElement('tr')
    model.header.forEach((cell, i) => {
      const th = document.createElement('th')
      wireCell(th, cell, model.align[i] ?? null)
      htr.appendChild(th)
    })
    thead.appendChild(htr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    model.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr')
      model.header.forEach((_, i) => {
        const td = document.createElement('td')
        const onDelete = i === model.header.length - 1
          ? (): void => {
              const insert = deleteTableRow(this.source, rowIdx)
              if (insert !== this.source) {
                view.dispatch({ changes: { from: this.from, to: this.to, insert } })
              }
            }
          : undefined
        wireCell(td, row[i] ?? '', model.align[i] ?? null, onDelete)
        tr.appendChild(td)
      })

      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    wrap.appendChild(table)

    // Hover toolbar for row/column operations
    const toolbar = document.createElement('div')
    toolbar.className = 'cm-table-toolbar'

    const addRowBtn = document.createElement('button')
    addRowBtn.textContent = '+ 行'
    addRowBtn.title = '添加行'
    addRowBtn.addEventListener('click', () => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.dataset.raw ?? c.textContent ?? '')
      const colCount = header.length
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).slice(0, colCount).map((c) => c.dataset.raw ?? c.textContent ?? '')
      )
      rows.push(header.map(() => ''))
      const insert = serializeTable({ header, align: model.align, rows })
      if (insert !== this.source) view.dispatch({ changes: { from: this.from, to: this.to, insert } })
    })

    const removeRowBtn = document.createElement('button')
    removeRowBtn.textContent = '- 行'
    removeRowBtn.title = '删除最后一行'
    removeRowBtn.addEventListener('click', () => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.dataset.raw ?? c.textContent ?? '')
      const colCount = header.length
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).slice(0, colCount).map((c) => c.dataset.raw ?? c.textContent ?? '')
      )
      if (rows.length > 1) {
        rows.pop()
        const insert = serializeTable({ header, align: model.align, rows })
        if (insert !== this.source) view.dispatch({ changes: { from: this.from, to: this.to, insert } })
      }
    })

    const addColBtn = document.createElement('button')
    addColBtn.textContent = '+ 列'
    addColBtn.title = '添加列'
    addColBtn.addEventListener('click', () => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.dataset.raw ?? c.textContent ?? '')
      const colCount = header.length
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).slice(0, colCount).map((c) => c.dataset.raw ?? c.textContent ?? '')
      )
      header.push('')
      const newAlign = [...model.align, null as Align]
      rows.forEach((r) => r.push(''))
      const insert = serializeTable({ header, align: newAlign, rows })
      if (insert !== this.source) view.dispatch({ changes: { from: this.from, to: this.to, insert } })
    })

    const removeColBtn = document.createElement('button')
    removeColBtn.textContent = '- 列'
    removeColBtn.title = '删除最后一列'
    removeColBtn.addEventListener('click', () => {
      const headCells = Array.from(table.tHead?.rows[0]?.cells ?? [])
      const header = headCells.map((c) => c.dataset.raw ?? c.textContent ?? '')
      const colCount = header.length
      const rows = Array.from(table.tBodies[0]?.rows ?? []).map((r) =>
        Array.from(r.cells).slice(0, colCount).map((c) => c.dataset.raw ?? c.textContent ?? '')
      )
      if (header.length > 1) {
        header.pop()
        const newAlign = model.align.slice(0, -1)
        rows.forEach((r) => r.pop())
        const insert = serializeTable({ header, align: newAlign, rows })
        if (insert !== this.source) view.dispatch({ changes: { from: this.from, to: this.to, insert } })
      }
    })

    toolbar.append(addRowBtn, removeRowBtn, addColBtn, removeColBtn)
    wrap.appendChild(toolbar)

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

function canReadLocalImage(path: string): boolean {
  return !/^(https?:|data:|asset:|blob:)/i.test(path)
}

function isRemoteUrl(path: string): boolean {
  return /^https?:/i.test(path)
}

function mediaMimeType(path: string): string {
  const clean = path.split(/[?#]/, 1)[0].toLowerCase()
  if (clean.endsWith('.mp4') || clean.endsWith('.m4v')) return 'video/mp4'
  if (clean.endsWith('.webm')) return 'video/webm'
  if (clean.endsWith('.mov')) return 'video/quicktime'
  if (clean.endsWith('.ogv')) return 'video/ogg'
  if (clean.endsWith('.mp3')) return 'audio/mpeg'
  if (clean.endsWith('.wav')) return 'audio/wav'
  if (clean.endsWith('.ogg')) return 'audio/ogg'
  if (clean.endsWith('.m4a')) return 'audio/mp4'
  if (clean.endsWith('.aac')) return 'audio/aac'
  if (clean.endsWith('.flac')) return 'audio/flac'
  const dataMatch = path.match(/^data:([^;,]+)/i)
  return dataMatch?.[1] ?? ''
}

function mediaErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return '未知错误'
}

/** Renders `![alt](src)` as an inline image with graceful error fallback. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    /** Absolute path or external URL; null when unresolvable (no doc path). */
    readonly resolved: string | null,
    readonly width?: number,
    readonly height?: number
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.resolved === this.resolved &&
      other.width === this.width &&
      other.height === this.height
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    if (!this.resolved) return this.renderError(wrap)

    let currentUrl = toDisplayUrl(this.resolved)
    let triedLocalBytes = false
    let remoteFallbackUsed = false
    const img = document.createElement('img')
    img.alt = this.alt
    if (this.width) img.style.width = `${this.width}px`
    if (this.height) img.style.height = `${this.height}px`
    const dims = imageDims.get(currentUrl)
    if (dims) img.style.aspectRatio = `${dims.w} / ${dims.h}`
    img.addEventListener('mousedown', (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      wrap.dispatchEvent(
        new CustomEvent('margin-open-image-preview', {
          detail: { src: currentUrl, alt: this.alt },
          bubbles: true,
          composed: true
        })
      )
    })
    img.addEventListener('load', () => {
      if (!wrap.isConnected) return
      if (!imageDims.has(currentUrl)) {
        imageDims.set(currentUrl, { w: img.naturalWidth, h: img.naturalHeight })
        view.requestMeasure()
      }
    })
    img.addEventListener('error', () => {
      if (!wrap.isConnected) return

      // Local file fallback: try reading as a data URL (handles Tauri asset:// quirks).
      if (!triedLocalBytes && this.resolved && canReadLocalImage(this.resolved)) {
        triedLocalBytes = true
        const failedUrl = currentUrl
        void api
          .readAssetDataUrl(this.resolved)
          .then((dataUrl) => {
            if (!wrap.isConnected) return
            currentUrl = dataUrl
            img.src = currentUrl
            view.requestMeasure()
          })
          .catch(() => {
            if (!wrap.isConnected) return
            wrap.textContent = ''
            this.renderError(wrap, failedUrl)
            view.requestMeasure()
          })
        return
      }

      // Remote URL fallback: cache → data URL pipeline.
      if (!remoteFallbackUsed && this.resolved && isRemoteUrl(this.resolved)) {
        remoteFallbackUsed = true
        const failedUrl = currentUrl
        void api
          .cacheRemoteMedia(this.resolved)
          .then((cachedPath) => {
            if (!wrap.isConnected) return
            currentUrl = toDisplayUrl(cachedPath)
            img.src = currentUrl
            view.requestMeasure()
          })
          .catch(() => {
            if (!wrap.isConnected) return
            void api
              .readRemoteDataUrl(this.resolved!)
              .then((dataUrl) => {
                if (!wrap.isConnected) return
                currentUrl = dataUrl
                img.src = currentUrl
                view.requestMeasure()
              })
              .catch(() => {
                if (!wrap.isConnected) return
                wrap.textContent = ''
                this.renderError(wrap, failedUrl)
                view.requestMeasure()
              })
          })
        return
      }

      wrap.textContent = ''
      this.renderError(wrap, currentUrl)
      view.requestMeasure()
    })
    img.src = currentUrl
    wrap.appendChild(img)
    return wrap
  }

  private renderError(wrap: HTMLElement, displayUrl?: string): HTMLElement {
    const ph = document.createElement('span')
    ph.className = 'cm-image-error'
    const resolved = this.resolved ? ` → ${this.resolved}` : ''
    const url = displayUrl ? ` → ${displayUrl}` : ''
    ph.textContent = `图片加载失败: ${this.alt || ''} (${this.src}${resolved}${url})`
    wrap.appendChild(ph)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

export class MediaWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly resolved: string | null,
    readonly width?: number,
    readonly height?: number
  ) {
    super()
  }

  eq(other: MediaWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.resolved === this.resolved &&
      other.width === this.width &&
      other.height === this.height
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-media-wrap'
    if (!this.resolved) {
      const ph = document.createElement('span')
      ph.className = 'cm-image-error'
      ph.textContent = `媒体加载失败: ${this.alt || this.src}`
      wrap.appendChild(ph)
      return wrap
    }

    const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i.test(this.src)
    const el = isAudio ? document.createElement('audio') : document.createElement('video')
    const status = document.createElement('span')
    el.controls = true
    el.preload = 'metadata'
    el.className = 'cm-media-control'
    // Ensure the element is always visible — some WebViews collapse
    // media elements that lack explicit dimensions.
    el.style.width = '100%'
    if (isAudio) {
      el.style.height = '48px'
    }
    status.className = 'cm-media-status'
    status.hidden = true
    if (!isAudio) {
      const video = el as HTMLVideoElement
      video.playsInline = true
      if (this.width) video.style.width = `${this.width}px`
      if (this.height) video.style.height = `${this.height}px`
    }

    const setStatus = (message: string, failed = false): void => {
      status.hidden = false
      status.textContent = message
      status.classList.toggle('cm-media-status-error', failed)
    }

    const fail = (error: unknown): void => {
      setStatus(`媒体加载失败: ${mediaErrorMessage(error)}`, true)
    }

    // Element must be in DOM before setting src so the WebView connects it
    // properly and the controls bar is visible from the start.
    wrap.appendChild(el)
    wrap.appendChild(status)

    if (isRemoteUrl(this.resolved)) {
      // Remote media: set direct URL for immediate visibility, AND start
      // cache download in parallel via the Rust backend (bypasses WebView
      // restrictions). When the cached file is ready, swap to asset:// URL.
      el.src = toDisplayUrl(this.resolved)

      let cacheDone = false
      let directFailed = false

      const applyCached = (path: string): void => {
        if (!wrap.isConnected || cacheDone) return
        cacheDone = true
        el.src = toDisplayUrl(path)
        setStatus('已缓存远程媒体，若仍无法播放请检查媒体编码。')
      }

      const tryDataUrl = (): void => {
        if (!wrap.isConnected || cacheDone) return
        setStatus('正在读取远程媒体数据…')
        void api
          .readRemoteDataUrl(this.resolved!)
          .then((url) => {
            if (!wrap.isConnected || cacheDone) return
            cacheDone = true
            el.src = url
            setStatus('已加载内存媒体，若仍无法播放请检查媒体编码。')
          })
          .catch((e) => {
            if (!wrap.isConnected || cacheDone) return
            fail(e)
          })
      }

      // Start cache download immediately — runs in Rust, not affected by
      // WebView network restrictions.
      setStatus('正在缓存远程媒体...')
      void api
        .cacheRemoteMedia(this.resolved)
        .then((path) => {
          if (directFailed || !wrap.isConnected) {
            applyCached(path)
          } else {
            // Direct load hasn't failed yet — cache is ready as backup.
            // Keep direct URL for now; if it fails later the error handler
            // will still fire and we'll apply the cache then.
            cacheDone = true
            el.src = toDisplayUrl(path)
            setStatus('已缓存远程媒体，若仍无法播放请检查媒体编码。')
          }
        })
        .catch(() => {
          if (!wrap.isConnected) return
          tryDataUrl()
        })

      el.addEventListener('error', () => {
        if (!wrap.isConnected) return
        directFailed = true
        if (cacheDone) {
          // Cache is already applied; try data URL as last resort.
          tryDataUrl()
        }
        // else: cache is still downloading, wait for it.
      }, { once: true })

    } else {
      // Local media: direct asset:// URL with data URL fallback.
      el.src = toDisplayUrl(this.resolved)
      el.addEventListener('error', () => {
        if (!wrap.isConnected) return
        setStatus('正在读取本地媒体备用数据...')
        void api
          .readAssetDataUrl(this.resolved!)
          .then((url) => {
            if (!wrap.isConnected) return
            el.src = url
            setStatus('已切换到内存媒体，若仍无法播放请检查媒体编码。')
          })
          .catch((e) => {
            if (!wrap.isConnected) return
            fail(e)
          })
      }, { once: true })
    }

    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Standalone-line image: block presentation below the (concealed) source line. */
export class ImageBlockWidget extends ImageWidget {
  eq(other: ImageBlockWidget): boolean {
    return super.eq(other)
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-image-block'
    wrap.appendChild(super.toDOM(view))
    wrap.addEventListener('mousedown', (e) => {
      if (e.metaKey || e.ctrlKey) return // Cmd+click keeps the preview-overlay behavior
      e.preventDefault()
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } })
      view.focus()
    })
    return wrap
  }
}

export class MediaBlockWidget extends MediaWidget {
  eq(other: MediaBlockWidget): boolean {
    return super.eq(other)
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-media-block'
    wrap.appendChild(super.toDOM(view))
    return wrap
  }
}

export class MathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly block: boolean
  ) {
    super()
  }

  eq(other: MathWidget): boolean {
    return other.source === this.source && other.block === this.block
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement(this.block ? 'div' : 'span')
    el.className = this.block ? 'cm-math-block' : 'cm-math-inline'
    void import('katex')
      .then((mod) => {
        if (!el.isConnected) return
        mod.default.render(this.source, el, {
          displayMode: this.block,
          throwOnError: true,
          strict: false
        })
        view.requestMeasure()
      })
      .catch((error) => {
        if (!el.isConnected) return
        el.classList.add('cm-math-error')
        el.textContent = this.block ? `$$${this.source}$$` : `$${this.source}$`
        el.title = error instanceof Error ? error.message : 'KaTeX render failed'
        view.requestMeasure()
      })
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}

export class CalloutWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly title: string,
    readonly body: string,
    readonly folded: boolean
  ) {
    super()
  }

  eq(other: CalloutWidget): boolean {
    return (
      other.type === this.type &&
      other.title === this.title &&
      other.body === this.body &&
      other.folded === this.folded
    )
  }

  toDOM(): HTMLElement {
    const root = document.createElement('aside')
    root.className = `cm-callout cm-callout-${this.type}`
    let open = !this.folded

    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'cm-callout-title'
    header.setAttribute('aria-expanded', String(open))
    const marker = document.createElement('span')
    marker.className = 'cm-callout-marker'
    marker.textContent = open ? '!' : '+'
    const title = document.createElement('span')
    title.textContent = this.title
    header.append(marker, title)
    root.appendChild(header)

    const renderBody = (): void => {
      root.querySelector('.cm-callout-body')?.remove()
      header.setAttribute('aria-expanded', String(open))
      marker.textContent = open ? '!' : '+'
      if (!open || !this.body) return
      const body = document.createElement('div')
      body.className = 'cm-callout-body'
      body.appendChild(renderInlineMarkdown(this.body))
      root.appendChild(body)
    }
    header.addEventListener('click', () => {
      open = !open
      renderBody()
    })
    renderBody()
    return root
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Renders [[target]] or [[target|display]] as the shared internal-link widget. */
export class WikiLinkWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly display: string
  ) {
    super()
  }

  eq(other: WikiLinkWidget): boolean {
    return other.target === this.target && other.display === this.display
  }

  toDOM(): HTMLElement {
    return createWikiLinkElement(this.target, this.display, (target, event) => {
      const source = event.currentTarget
      if (!(source instanceof HTMLElement)) return
      source.dispatchEvent(
        new CustomEvent('margin-open-link', {
          detail: `wiki:${target}`,
          bubbles: true,
          composed: true
        })
      )
    })
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Superscript badge for a `[^label]` footnote reference with hover preview. */
export class FootnoteWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly def: string
  ) {
    super()
  }

  eq(other: FootnoteWidget): boolean {
    return other.label === this.label && other.def === this.def
  }

  toDOM(): HTMLElement {
    const sup = document.createElement('sup')
    sup.className = 'cm-footnote-ref'
    sup.textContent = `[${this.label}]`
    if (this.def) {
      let tip: HTMLElement | null = null
      sup.addEventListener('mouseenter', () => {
        tip = document.createElement('div')
        tip.className = 'cm-footnote-tip'
        tip.textContent = this.def
        const r = sup.getBoundingClientRect()
        tip.style.position = 'fixed'
        tip.style.left = `${r.left}px`
        tip.style.top = `${r.bottom + 6}px`
        document.body.appendChild(tip)
      })
      sup.addEventListener('mouseleave', () => {
        tip?.remove()
        tip = null
      })
    }
    return sup
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Renders a list bullet (•) or number (1.) replacing the raw ListMark. */
export class BulletWidget extends WidgetType {
  constructor(
    readonly ordered: boolean,
    readonly number: number | undefined,
    readonly level: number
  ) {
    super()
  }

  eq(other: BulletWidget): boolean {
    return other.ordered === this.ordered && other.number === this.number && other.level === this.level
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-list-bullet'
    if (this.level > 0) {
      span.classList.add('cm-list-bullet-nested')
      span.style.setProperty('--list-level', String(this.level))
    }
    span.textContent = this.ordered ? `${this.number ?? 1}.` : '•'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}
