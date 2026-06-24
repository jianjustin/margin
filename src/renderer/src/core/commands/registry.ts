/**
 * Command registry — the single source of truth for "things the user can do".
 *
 * ROADMAP P0.3: one registry drives menus, keyboard shortcuts, the slash menu,
 * the command palette, and (later) plugin-contributed commands. It is pure data
 * + lookup, generic over a runtime context `Ctx` (e.g. the focused EditorView),
 * so it can be unit-tested without any UI.
 */

export interface Disposable {
  dispose(): void
}

export interface CommandDef<Ctx = unknown> {
  /** Stable, namespaced id, e.g. `editor.toggleBold` or `vault.newNote`. */
  id: string
  /** Human label for menus/palette. */
  title: string
  /** Grouping label, e.g. `编辑`, `文件`. */
  category?: string
  /** Display-only accelerator hint, e.g. `Mod-b`. The keymap owns actual binding. */
  keybinding?: string
  /** Icon token (renderer decides how to draw it). */
  icon?: string
  /** Hidden from palette/menus when false; still runnable by id. */
  visible?: boolean
  /** The effect. May be async. */
  run: (ctx: Ctx) => void | Promise<void>
}

export class CommandRegistry<Ctx = unknown> {
  private readonly commands = new Map<string, CommandDef<Ctx>>()
  private readonly order: string[] = []

  /** Register a command. Throws on duplicate id. Returns a disposable that unregisters it. */
  register(cmd: CommandDef<Ctx>): Disposable {
    if (this.commands.has(cmd.id)) {
      throw new Error(`command already registered: ${cmd.id}`)
    }
    this.commands.set(cmd.id, cmd)
    this.order.push(cmd.id)
    return { dispose: () => this.unregister(cmd.id) }
  }

  /** Register many; returns one disposable that unregisters all of them. */
  registerAll(cmds: readonly CommandDef<Ctx>[]): Disposable {
    const disposers = cmds.map((c) => this.register(c))
    return { dispose: () => disposers.forEach((d) => d.dispose()) }
  }

  unregister(id: string): void {
    if (!this.commands.delete(id)) return
    const i = this.order.indexOf(id)
    if (i >= 0) this.order.splice(i, 1)
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  get(id: string): CommandDef<Ctx> | undefined {
    return this.commands.get(id)
  }

  /** All commands in registration order. */
  list(): CommandDef<Ctx>[] {
    return this.order.map((id) => this.commands.get(id)!).filter(Boolean)
  }

  /** Commands eligible for menus/palette (`visible !== false`). */
  listVisible(): CommandDef<Ctx>[] {
    return this.list().filter((c) => c.visible !== false)
  }

  /** Run a command by id. Resolves false when the id is unknown, true otherwise. */
  async run(id: string, ctx: Ctx): Promise<boolean> {
    const cmd = this.commands.get(id)
    if (!cmd) return false
    await cmd.run(ctx)
    return true
  }
}
