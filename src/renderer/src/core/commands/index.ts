/**
 * core/commands — app-level command registry (ROADMAP P0.3).
 *
 * One registry unifies the command surfaces: menus, keyboard shortcuts, the
 * slash menu, the command palette, and plugin-contributed commands. The registry
 * is pure data + lookup, generic over a runtime context, so it unit-tests with
 * no UI. Editor command definitions (Ctx = EditorView) live in
 * `editor/commands/editorCommands` because they touch CodeMirror.
 */
export { CommandRegistry } from './registry'
export type { CommandDef, Disposable } from './registry'
export { filterCommands, subsequenceScore } from './filter'
export { SLASH_COMMANDS } from './slashCommands'
export type { SlashCommand } from './slashCommands'
