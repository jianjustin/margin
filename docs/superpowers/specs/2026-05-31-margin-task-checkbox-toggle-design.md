# Margin — Interactive Task Checkbox Toggle (M2 Enhancement)

## Background

The [M2 live-preview plan](../plans/2026-05-31-margin-m2-live-preview.md) renders GFM
task list items (`- [ ]` / `- [x]`) as real `<input type="checkbox">` widgets via
`CheckboxWidget`. To keep M2 focused, the widget was shipped read-only:

```ts
// src/renderer/src/editor/livePreview/widgets.ts (Task 4)
box.disabled = true
```

`livePreviewPlugin` has no click handling either, so even removing `disabled`
would only toggle the input's native UI state — the underlying markdown would
never change.

This spec adds the smallest possible enhancement: **clicking a rendered task
checkbox toggles the corresponding `[ ]` / `[x]` in the document text**. Out of
scope: completed-line strike-through styling, keyboard shortcuts, nested-task
propagation. Those are future milestones.

## Goal

Clicking a `cm-task-checkbox` widget rewrites the three characters under it
(`[ ]` ↔ `[x]`) in `EditorState.doc`, so the change flows through the existing
autosave path and round-trips losslessly to disk.

## Non-goals

- Strike-through styling on completed lines (deferred).
- Keyboard shortcut to toggle the task on the current line (deferred).
- Behavior when the cursor is on the task line (reveal mode) — the raw `- [ ]`
  text is already visible and editable; no extra wiring needed.
- Nested-task auto-completion (e.g. checking a parent ticking all children).

## Architecture

Three pieces, each with a single responsibility:

1. **Pure toggle function** (`editor/livePreview/toggleTask.ts`) — given a
   document string and a position, returns the change descriptor or `null`.
   Fully unit-testable in node.
2. **Editable widget** (`editor/livePreview/widgets.ts`) — `CheckboxWidget` no
   longer disables its `<input>`. It remains render-only; it does not own the
   click handler or hold a view reference.
3. **Plugin event handler** (`editor/livePreview/livePreviewPlugin.ts`) — the
   `ViewPlugin` gains a `mousedown` handler that detects clicks on
   `.cm-task-checkbox`, locates the doc position via `view.posAtDOM`, calls the
   pure toggle function, and dispatches the resulting transaction. All
   document-mutating logic lives in this one place.

```
DOM click on .cm-task-checkbox
        │
        ▼
ViewPlugin.eventHandlers.mousedown
        │  view.posAtDOM(target) → pos
        ▼
toggleTaskAt(doc, pos)        ← pure, unit-tested
        │  returns { from, to, insert } | null
        ▼
view.dispatch({ changes })
        │
        ▼
existing updateListener → onChange → autosave
```

`posAtDOM` returns the start of the range that the widget replaced — which is
exactly the position of `[` in `- [ ]` / `- [x]`, matching what the Task 3
collector emits for `TaskMarker`. The pure function defends against drift by
re-checking the three-character slice and bailing out with `null` if it does
not match.

## Module contracts

### `toggleTask.ts`

```ts
export function toggleTaskAt(
  docText: string,
  pos: number
): { from: number; to: number; insert: string } | null
```

Behavior:

- `docText.slice(pos, pos+3) === '[ ]'` → `{ from: pos, to: pos+3, insert: '[x]' }`
- `docText.slice(pos, pos+3) === '[x]'` → `{ from: pos, to: pos+3, insert: '[ ]' }`
- `docText.slice(pos, pos+3) === '[X]'` → `{ from: pos, to: pos+3, insert: '[ ]' }`
- Anything else → `null`

The function does not need the syntax tree; the Lezer-derived widget position is
trustworthy and the slice check is a cheap safety net.

### `widgets.ts` (delta)

Remove the `box.disabled = true` line. `eq` still compares `checked` only.
`ignoreEvent()` still returns `false` so CodeMirror routes mouse events to the
plugin's handler.

### `livePreviewPlugin.ts` (delta)

Add `eventHandlers` to the `ViewPlugin.fromClass` spec object:

```ts
eventHandlers: {
  mousedown(event, view) {
    const target = event.target as HTMLElement | null
    if (!target?.classList.contains('cm-task-checkbox')) return false
    const pos = view.posAtDOM(target)
    const change = toggleTaskAt(view.state.doc.toString(), pos)
    if (!change) return false
    event.preventDefault()
    view.dispatch({ changes: change })
    return true
  }
}
```

Returning `true` tells CodeMirror the event was handled, so the click does not
also move the selection — keeping the cursor off the task line means the widget
stays rendered (it does not flip into reveal mode mid-click).

## Data flow

1. User clicks the checkbox widget.
2. `mousedown` handler resolves the doc position; reads three chars; computes
   the new slice.
3. `view.dispatch({ changes })` updates `EditorState.doc`.
4. The existing `EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()) })` in `Editor.tsx`
   fires, which feeds the existing autosave (debounced ~0.8s) in
   [Editor.tsx](../../../src/renderer/src/components/Editor.tsx).
5. On the next CodeMirror update, the live-preview plugin rebuilds decorations
   from the new state; the widget re-renders with the toggled `checked` value.

## Testing strategy

- **Unit (node)**: `test/toggleTask.test.ts` — four cases:
  - `[ ]` at `pos` → toggles to `[x]`.
  - `[x]` at `pos` → toggles to `[ ]`.
  - `[X]` at `pos` → toggles to `[ ]` (read is case-insensitive; the canonical
    write is always lowercase `[x]` when checking, `[ ]` when unchecking — the
    function never emits uppercase `[X]`).
  - position pointing at non-task text → returns `null`.
- **Unit (existing, untouched)**: `decorationSpecs-block.test.ts` still passes;
  the `task` spec shape did not change.
- **GUI (Task 7 extension)**: with `/tmp/margin-m2.md` open, click `[x] done`
  → checkbox becomes empty, line text now `- [ ] done`; click `[ ] pending`
  → checkbox fills, line text now `- [x] pending`. Wait for autosave, `cat`
  the file from a separate terminal, confirm the literal `- [x]` / `- [ ]`
  matches the UI. Confirm the editor cursor did not jump to the task line on
  click.

There is no value in unit-testing `CheckboxWidget.toDOM` or the
`mousedown` wiring in node — both need a real `EditorView` and DOM. GUI
verification covers them.

## Error / edge handling

- **Click that misses the input** (e.g. the surrounding line padding): the
  `classList.contains('cm-task-checkbox')` guard bails out, the event flows
  normally, the click positions the cursor as usual.
- **Stale position** (widget DOM somehow drifts from the markdown): the
  `toggleTaskAt` slice check returns `null`, the handler `return false`s, and
  no transaction fires. The user sees a no-op rather than a corrupted file.
- **Selection during click**: `event.preventDefault()` + returning `true`
  suppresses the default cursor placement, so a click does not trigger reveal
  mode on the task line — the widget stays rendered.
- **Autosave failures**: out of scope for this spec; they're tracked separately
  as open M1 follow-ups.

## File layout impact

```
src/renderer/src/editor/livePreview/
├─ toggleTask.ts            NEW: pure toggleTaskAt()
├─ widgets.ts               MODIFIED: drop `box.disabled = true`
├─ livePreviewPlugin.ts     MODIFIED: add eventHandlers.mousedown
└─ … (other files unchanged)

test/
└─ toggleTask.test.ts       NEW
```

No changes to `decorationSpecs.ts`, `reveal.ts`, `theme.ts`, or `Editor.tsx`.

## Risks and mitigations

- **CodeMirror version drift on `posAtDOM` semantics** — the `@codemirror/view`
  API guarantees `posAtDOM` returns the doc position closest to the DOM node;
  for `Decoration.replace` widgets it returns the start of the replaced range.
  Mitigation: the `toggleTaskAt` slice check rejects any position whose three
  characters are not a checkbox token, turning any future API drift into a
  silent no-op instead of corruption.
- **Event swallowing breaking other handlers** — the handler only returns
  `true` after a successful toggle; misses bail out with `return false` so
  CodeMirror's default click handling runs unchanged.
- **Race with autosave** — the existing autosave already debounces doc changes;
  one extra `dispatch` per click is well within its design envelope.
