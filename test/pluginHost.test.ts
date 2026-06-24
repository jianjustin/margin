import { describe, it, expect, vi } from 'vitest'
import {
  PluginHost,
  EventBus,
  createVaultInfoPlugin,
  type HostServices,
  type MarginPlugin,
  type CommandContribution
} from '@/plugin-api'
import type { VaultSnapshot } from '@/vault-core'

const SNAPSHOT: VaultSnapshot = {
  root: '/v',
  tree: [
    { name: 'a.md', path: '/v/a.md', type: 'file' },
    { name: 'b.md', path: '/v/b.md', type: 'file' }
  ]
}

/** A CommandSink backed by a Map, plus helpers to inspect/run what was registered. */
function makeServices(): HostServices & { registered: Map<string, CommandContribution> } {
  const registered = new Map<string, CommandContribution>()
  return {
    registered,
    commands: {
      register: (c) => {
        registered.set(c.id, c)
        return { dispose: () => registered.delete(c.id) }
      }
    },
    vaultSnapshot: () => SNAPSHOT,
    events: new EventBus()
  }
}

describe('PluginHost — lifecycle', () => {
  it('activates a plugin and registers its contributions', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    const onInfo = vi.fn()

    await host.activate(createVaultInfoPlugin(onInfo))
    expect(host.isActive('builtin.vault-info')).toBe(true)
    expect(services.registered.has('builtin.vault-info.count')).toBe(true)

    // run the contributed command — it reads the vault snapshot via the facade
    await services.registered.get('builtin.vault-info.count')!.run()
    expect(onInfo).toHaveBeenCalledWith(2)
  })

  it('deactivation disposes everything the plugin registered', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await host.activate(createVaultInfoPlugin(vi.fn()))
    await host.deactivate('builtin.vault-info')
    expect(host.isActive('builtin.vault-info')).toBe(false)
    expect(services.registered.size).toBe(0)
  })

  it('refuses to activate the same plugin twice', async () => {
    const host = new PluginHost(makeServices())
    await host.activate(createVaultInfoPlugin(vi.fn()))
    await expect(host.activate(createVaultInfoPlugin(vi.fn()))).rejects.toThrow(/already active/)
  })
})

describe('PluginHost — permission gating', () => {
  const undeclared: MarginPlugin = {
    manifest: { id: 'bad.actor', name: 'Bad', version: '1.0.0' /* no permissions */ },
    activate(ctx) {
      ctx.commands.register({ id: 'bad.cmd', title: 'x', run: () => {} })
    }
  }

  it('throws when a plugin uses an undeclared capability, leaving no partial state', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    await expect(host.activate(undeclared)).rejects.toThrow(/lacks permission: commands/)
    expect(host.isActive('bad.actor')).toBe(false)
    expect(services.registered.size).toBe(0)
  })

  it('gates vault.read on the snapshot accessor', async () => {
    const services = makeServices()
    const host = new PluginHost(services)
    const peeker: MarginPlugin = {
      manifest: { id: 'peek', name: 'Peek', version: '1.0.0', permissions: ['commands'] },
      activate(ctx) {
        ctx.commands.register({ id: 'peek.cmd', title: 'peek', run: () => ctx.vault.snapshot() })
      }
    }
    await host.activate(peeker)
    // command registered fine (had `commands`), but running it touches vault without `vault.read`
    expect(() => services.registered.get('peek.cmd')!.run()).toThrow(/lacks permission: vault.read/)
  })
})

describe('EventBus', () => {
  it('delivers events to subscribers and stops after dispose', () => {
    const bus = new EventBus()
    const seen: string[] = []
    const sub = bus.on('changed', (e) => seen.push(e.type))
    bus.emit({ type: 'changed', path: '/v/a.md' })
    sub.dispose()
    bus.emit({ type: 'changed', path: '/v/a.md' })
    expect(seen).toEqual(['changed'])
  })
})
