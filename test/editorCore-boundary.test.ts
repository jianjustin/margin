import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as editorCore from '@/editor-core'

const CORE_DIR = resolve('src/renderer/src/editor-core')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('editor-core public surface', () => {
  it('exports the documented command + projection API', () => {
    const expected = [
      // projection
      'collectDecorations',
      'frontmatterEnd',
      'rangeRevealed',
      // outline
      'collectOutline',
      // inline marks
      'toggleInlineMark',
      'INLINE_MARKERS',
      // checkbox
      'toggleTaskOnLine',
      'isTaskLine',
      // link
      'wrapLink',
      // block
      'setHeading',
      'toggleBlockquote',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleTaskList',
      // line ops
      'moveLines',
      'duplicateLines',
      // list
      'parseListLine',
      'listEnterAction',
      'indentListLine',
      'outdentListLine',
      'LIST_INDENT',
      // table
      'parseTable',
      'serializeTable',
      'deleteTableRow',
      'insertTableRow',
      'insertTableColumn',
      'deleteTableColumn',
      'setColumnAlign',
      'createTable'
    ]
    for (const name of expected) {
      expect(editorCore, `missing export: ${name}`).toHaveProperty(name)
    }
  })
})

describe('editor-core renderer independence', () => {
  it('never imports a CodeMirror *view* runtime (keeps the kernel adapter-free)', () => {
    const offenders: string[] = []
    for (const file of walk(CORE_DIR)) {
      if (!file.endsWith('.ts')) continue
      const src = readFileSync(file, 'utf8')
      if (/from ['"]@codemirror\/view['"]/.test(src)) offenders.push(file)
    }
    expect(offenders, `editor-core must not depend on @codemirror/view: ${offenders.join(', ')}`).toEqual([])
  })
})
