import type { TreeNode } from '../../../shared/ipc'
import { isExternal, resolveRelative } from './resolvePath'

export interface BacklinkDoc {
  path: string
  content: string
}

export interface BacklinkResult {
  path: string
  label: string
  count: number
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

function extname(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function stripMdExt(name: string): string {
  return name.replace(/\.(md|markdown|mdx)$/i, '')
}

function stripFragment(target: string): string {
  return target.split('#')[0].split('?')[0].trim()
}

function normalizeWikiTarget(target: string, sourcePath: string): string | null {
  const clean = stripFragment(target.split('|')[0] ?? '')
  if (!clean || isExternal(clean)) return null
  const withExt = /\.[^/]+$/.test(clean) ? clean : `${clean}.md`
  return resolveRelative(withExt, sourcePath)
}

export function markdownFilesInTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]): void => {
    for (const node of list) {
      if (node.type === 'folder') {
        walk(node.children ?? [])
      } else if (MARKDOWN_EXTENSIONS.has(extname(node.name))) {
        out.push(node)
      }
    }
  }
  walk(nodes)
  return out
}

function markdownTargets(content: string, sourcePath: string): string[] {
  const out: string[] = []
  const inlineLink = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const match of content.matchAll(inlineLink)) {
    if (match[0].startsWith('!')) continue
    const raw = stripFragment(match[1] ?? '')
    if (!raw || isExternal(raw)) continue
    const resolved = resolveRelative(raw, sourcePath)
    if (resolved) out.push(resolved)
  }

  const wikiLink = /\[\[([^\]\n]+)\]\]/g
  for (const match of content.matchAll(wikiLink)) {
    const resolved = normalizeWikiTarget(match[1] ?? '', sourcePath)
    if (resolved) out.push(resolved)
  }
  return out
}

function sameTarget(targetPath: string, currentPath: string): boolean {
  if (targetPath === currentPath) return true
  return stripMdExt(basename(targetPath)) === stripMdExt(basename(currentPath))
}

export function findBacklinksInDocs(docs: BacklinkDoc[], currentPath: string): BacklinkResult[] {
  return docs
    .filter((doc) => doc.path !== currentPath)
    .map((doc) => {
      const count = markdownTargets(doc.content, doc.path).filter((target) =>
        sameTarget(target, currentPath)
      ).length
      return { path: doc.path, label: basename(doc.path), count }
    })
    .filter((item) => item.count > 0)
}
