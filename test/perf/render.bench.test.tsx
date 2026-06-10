// @vitest-environment jsdom
//
// Performance benchmark for the React re-render hot path.
//
// In App.tsx the top-level component subscribes to `content`, so every keystroke
// updates the document store and re-renders the whole tree — including the
// (unmemoized) Sidebar → FileTree → every FileTreeRow. This benchmark measures
// the cost of one such re-render for a realistic vault, with the SAME props (the
// work React does purely because the parent re-rendered).
import { describe, it, afterEach } from 'vitest'
import { useState } from 'react'
import { act, render, cleanup } from '@testing-library/react'
import { FileTree } from '@/components/FileTree/FileTree'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../../src/shared/ipc'

function buildVault(folders: number, filesPerFolder: number): TreeNode[] {
  const nodes: TreeNode[] = []
  for (let f = 0; f < folders; f++) {
    const children: TreeNode[] = []
    for (let i = 0; i < filesPerFolder; i++) {
      children.push({ name: `note-${f}-${i}.md`, path: `/v/folder-${f}/note-${i}.md`, type: 'file' })
    }
    nodes.push({ name: `folder-${f}`, path: `/v/folder-${f}`, type: 'folder', children })
  }
  return nodes
}

function medianMs(runs: number, fn: () => void): number {
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

afterEach(cleanup)

describe('file-tree re-render latency (per-keystroke App re-render)', () => {
  it('measures one parent-driven re-render by vault size', () => {
    const SIZES = [
      { folders: 5, per: 10, label: 'small (~55 rows)' },
      { folders: 20, per: 25, label: 'medium (~520 rows)' },
      { folders: 40, per: 50, label: 'large (~2040 rows)' }
    ]

    const rows: string[] = []
    rows.push(['vault', 'rows', 're-render'].map((s) => s.padEnd(24)).join(''))

    for (const { folders, per, label } of SIZES) {
      const tree = buildVault(folders, per)
      const expanded = new Set(tree.map((n) => n.path))
      act(() => {
        useVaultStore.setState({ tree, expanded, root: '/v', selectedPath: null })
      })

      let bump: (n: number) => void = () => {}
      function Harness(): JSX.Element {
        const [n, setN] = useState(0)
        bump = setN
        // Reproduce App's shape: an unmemoized FileTree child whose parent
        // re-renders on every keystroke. Props are referentially stable here,
        // so this isolates the cost React pays just for the parent re-render.
        void n
        return (
          <FileTree onOpenFile={() => {}} onContextMenu={() => {}} filteredTree={null} />
        )
      }

      let view: ReturnType<typeof render>
      act(() => {
        view = render(<Harness />)
      })

      let k = 0
      const reMs = medianMs(15, () => {
        act(() => bump(++k))
      })

      cleanup()
      const rowCount = view!.container.querySelectorAll('[title]').length || folders + folders * per

      rows.push([label, String(rowCount), reMs.toFixed(2) + ' ms'].map((s) => s.padEnd(24)).join(''))
    }

    // eslint-disable-next-line no-console
    console.log('\n' + rows.join('\n') + '\n')
  })
})
