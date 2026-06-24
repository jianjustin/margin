import { describe, it, expect, vi } from 'vitest'
import {
  CommandRegistry,
  filterCommands,
  subsequenceScore,
  SLASH_COMMANDS,
  type CommandDef
} from '@/core/commands'
import { editorCommands } from '@/editor/commands/editorCommands'

function cmd(id: string, title = id, extra: Partial<CommandDef> = {}): CommandDef {
  return { id, title, run: () => {}, ...extra }
}

describe('CommandRegistry', () => {
  it('registers, looks up, and lists in order', () => {
    const reg = new CommandRegistry()
    reg.register(cmd('a'))
    reg.register(cmd('b'))
    expect(reg.has('a')).toBe(true)
    expect(reg.get('b')?.title).toBe('b')
    expect(reg.list().map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('throws on duplicate id', () => {
    const reg = new CommandRegistry()
    reg.register(cmd('dup'))
    expect(() => reg.register(cmd('dup'))).toThrow(/already registered/)
  })

  it('disposing a registration unregisters it', () => {
    const reg = new CommandRegistry()
    const d = reg.register(cmd('x'))
    d.dispose()
    expect(reg.has('x')).toBe(false)
  })

  it('registerAll returns one disposable that removes all', () => {
    const reg = new CommandRegistry()
    const d = reg.registerAll([cmd('a'), cmd('b')])
    expect(reg.list()).toHaveLength(2)
    d.dispose()
    expect(reg.list()).toHaveLength(0)
  })

  it('runs a command with context and reports unknown ids', async () => {
    const reg = new CommandRegistry<number>()
    const spy = vi.fn()
    reg.register({ id: 'r', title: 'r', run: (ctx) => spy(ctx) })
    expect(await reg.run('r', 42)).toBe(true)
    expect(spy).toHaveBeenCalledWith(42)
    expect(await reg.run('missing', 0)).toBe(false)
  })

  it('listVisible hides visible:false commands', () => {
    const reg = new CommandRegistry()
    reg.register(cmd('shown'))
    reg.register(cmd('hidden', 'hidden', { visible: false }))
    expect(reg.listVisible().map((c) => c.id)).toEqual(['shown'])
  })
})

describe('subsequenceScore', () => {
  it('matches subsequences and penalizes gaps', () => {
    expect(subsequenceScore('toggle bold', 'tb')).toBeGreaterThanOrEqual(0)
    expect(subsequenceScore('toggle bold', 'tgb')).toBeGreaterThanOrEqual(0)
    expect(subsequenceScore('toggle bold', 'xyz')).toBe(-1)
  })

  it('an exact prefix scores 0 (tightest)', () => {
    expect(subsequenceScore('bold', 'bold')).toBe(0)
  })
})

describe('filterCommands', () => {
  const cmds = [cmd('editor.bold', '粗体', { category: '编辑' }), cmd('editor.h1', '一级标题', { category: '段落' })]

  it('returns all visible commands for an empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(2)
  })

  it('filters by title match', () => {
    expect(filterCommands(cmds, '标题').map((c) => c.id)).toEqual(['editor.h1'])
  })
})

describe('command catalogs', () => {
  it('slash commands have unique ids', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('editor commands have unique ids and a keybinding hint', () => {
    const ids = editorCommands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(editorCommands.every((c) => c.id.startsWith('editor.'))).toBe(true)
    expect(editorCommands.every((c) => typeof c.keybinding === 'string')).toBe(true)
  })
})
