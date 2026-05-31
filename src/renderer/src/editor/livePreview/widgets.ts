import { WidgetType } from '@codemirror/view'

/** Renders a task-list checkbox replacing the raw `[ ]` / `[x]` token. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task-checkbox'
    // Read-only rendering in M2: toggling is a later milestone.
    box.disabled = true
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
