# margin-assistant 内核 v0 + Hermes 宿主 实施计划

> **⚠️ 已作废（2026-07-06 同日）**：设计已修订为 v2——教学会话为核心、margin 插件 + Node sidecar 形态、去 Hermes（见 spec `docs/superpowers/specs/2026-07-06-knowledge-assistant-design.md`）。本计划未执行任何任务。Task 2-11 的确定性模块设计（协议/解析/扫描/进度/连接器/渲染）在新计划中将以 agent tools 形式复用，届时可参考本文件的代码细节。执行顺序改为：先完整执行 margin 重构方案 P5，再为 Tutor 写新计划。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成 margin-assistant 内核 v0（独立 TS 仓库 + CLI：扫描/计划/进度/抓取/LLM/渲染/daily/report 编排）及 Hermes 宿主层（两个定时 job + 对话 skill + launchd 退出通道）。

**Architecture:** 厚内核 + Hermes 值班员。内核含完整生产线（含 LLM 工序，无 key 规则降级），宿主只通过 CLI + 文件对接。文件协议：学习计划靠 frontmatter `type: learning-plan` 发现，机器产物集中在 vault 的 `_assistant/`，生成物带 `generated-by` 标记保护。

**Tech Stack:** TypeScript (ESM, NodeNext), Node 20+, vitest, js-yaml, fast-xml-parser, @anthropic-ai/sdk。CLI 用 Node 内置 `util.parseArgs`。

**Spec:** margin 仓库 `docs/superpowers/specs/2026-07-06-knowledge-assistant-design.md`（本计划一切语义以 spec 为准）。

## Global Constraints

- **工作目录**：`/Users/jianjustin/workspaces/margin-assistant`（Task 1 创建；后续所有任务都在该仓库内，直接在 main 提交）。计划文档本身在 margin 仓库，不要改动 margin 仓库其他内容。
- **运行时依赖上限**：`js-yaml`、`fast-xml-parser`、`@anthropic-ai/sdk` 三个，禁止新增（dev 依赖：`typescript`、`vitest`、`tsx`、`@types/node`、`@types/js-yaml`）。内核零 Hermes SDK 依赖。
- **写入安全规则（spec 3.2）**：内核只覆盖 frontmatter 含 `generated-by: margin-assistant` 的文件；`_assistant/` 之外仅允许 `ma plan create` 新建（已存在即报错，永不覆盖），其余场景只读；绝不触碰用户普通笔记。
- **计划不静默改写（spec 3.1）**：任何命令都不得修改已有 learning-plan 文件（含 checkbox）。
- **LLM 可降级（spec 2）**：所有命令在无 API key 或 LLM 失败时走纯规则路径，产物 frontmatter 标 `degraded: true`。
- **CLI 输出**：除写文件的命令外，stdout 输出 JSON；错误信息走 stderr，非零退出码。
- **协议字段拼写**：`type: learning-plan`、`generated-by: margin-assistant`、`generated-at`、`degraded`、status 枚举 `active | paused | done`。
- **测试不打真网**：connectors 用注入的 fetch 函数 + 固定 JSON/XML 样本回放；LLM 用 mock client。
- 中文写文档与提交说明正文；代码、标识符、conventional-commit 前缀用英文。

---

### Task 1: 仓库骨架

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `test/smoke.test.ts`

**Interfaces:**
- Produces: 可运行的 `npm test` / `npm run typecheck` / `npm run build`；包名 `margin-assistant`，bin 名 `ma`。

- [ ] **Step 1: 初始化仓库与配置文件**

```bash
mkdir -p /Users/jianjustin/workspaces/margin-assistant && cd /Users/jianjustin/workspaces/margin-assistant
git init -b main
npm init -y
npm install js-yaml fast-xml-parser @anthropic-ai/sdk
npm install -D typescript vitest tsx @types/node @types/js-yaml
```

覆写 `package.json`（保留 install 生成的版本号，其余字段如下）：

```json
{
  "name": "margin-assistant",
  "version": "0.1.0",
  "description": "Knowledge-base assistant kernel for margin/Obsidian vaults",
  "type": "module",
  "license": "MIT",
  "bin": { "ma": "dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src", "declaration": true },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 2: 写冒烟测试**

`test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: 验证工具链**

Run: `npm test && npm run typecheck`
Expected: 1 passed；typecheck 无错误。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 仓库骨架（TS ESM + vitest + bin ma）"
```

---

### Task 2: 协议类型与 frontmatter 解析

**Files:**
- Create: `src/protocol/types.ts`, `src/protocol/frontmatter.ts`
- Test: `test/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `types.ts` 全量协议类型（后续所有任务引用，字段以此为准）
  - `parseFrontmatter(text: string): { attrs: Record<string, unknown>; body: string }`（无 frontmatter 时 attrs 为 `{}`，body 为原文）
  - `serializeFrontmatter(attrs: Record<string, unknown>, body: string): string`

- [ ] **Step 1: 写失败测试**

`test/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '../src/protocol/frontmatter.js'

describe('parseFrontmatter', () => {
  it('parses yaml frontmatter and body', () => {
    const { attrs, body } = parseFrontmatter('---\ntype: learning-plan\ngoal: 学习 Rust\n---\n## 主题\n')
    expect(attrs.type).toBe('learning-plan')
    expect(attrs.goal).toBe('学习 Rust')
    expect(body).toBe('## 主题\n')
  })

  it('returns empty attrs when no frontmatter', () => {
    const { attrs, body } = parseFrontmatter('# 普通笔记\n')
    expect(attrs).toEqual({})
    expect(body).toBe('# 普通笔记\n')
  })

  it('round-trips via serialize', () => {
    const text = serializeFrontmatter({ 'generated-by': 'margin-assistant', degraded: true }, '正文\n')
    const { attrs, body } = parseFrontmatter(text)
    expect(attrs['generated-by']).toBe('margin-assistant')
    expect(attrs.degraded).toBe(true)
    expect(body).toBe('正文\n')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- frontmatter`
Expected: FAIL（Cannot find module '../src/protocol/frontmatter.js'）

- [ ] **Step 3: 实现**

`src/protocol/types.ts`:

```ts
export type PlanStatus = 'active' | 'paused' | 'done'

export interface PlanItem { text: string; done: boolean; links: string[]; line: number }
export interface PlanTopic { title: string; items: PlanItem[]; line: number }
export interface LearningPlan {
  path: string
  goal: string
  status: PlanStatus
  created: string
  topics: PlanTopic[]
}
export interface PlanIssue { path: string; line: number; message: string }

export interface VaultNote { path: string; title: string; mtimeMs: number; links: string[] }
export interface ScanResult {
  root: string
  notes: VaultNote[]
  plans: LearningPlan[]
  planIssues: PlanIssue[]
}

export interface TopicProgress {
  title: string
  done: number
  total: number
  lastActiveMs: number | null
  daysIdle: number | null
}
export interface PlanProgress {
  path: string
  goal: string
  done: number
  total: number
  completion: number
  topics: TopicProgress[]
  nextItems: { topic: string; text: string }[]
  staleTopics: string[]
}
export interface ProgressReport { generatedAt: string; plans: PlanProgress[] }

export interface FeedItem {
  source: string
  id: string
  title: string
  url: string
  summary?: string
  publishedAt?: string
}
export interface ScoredItem extends FeedItem {
  relevance: number | null
  reason?: string
  related: string[]
}
```

`src/protocol/frontmatter.ts`:

```ts
import yaml from 'js-yaml'

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

export function parseFrontmatter(text: string): { attrs: Record<string, unknown>; body: string } {
  const m = text.match(FM_RE)
  if (!m) return { attrs: {}, body: text }
  const parsed = yaml.load(m[1])
  const attrs = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  return { attrs, body: text.slice(m[0].length) }
}

export function serializeFrontmatter(attrs: Record<string, unknown>, body: string): string {
  return `---\n${yaml.dump(attrs).trimEnd()}\n---\n${body}`
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- frontmatter && npm run typecheck`
Expected: 3 passed；typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 协议类型与 frontmatter 解析"
```

---

### Task 3: 学习计划解析与校验（plan-model）

**Files:**
- Create: `src/plan/parse.ts`
- Test: `test/plan-parse.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`、`LearningPlan`/`PlanIssue` 类型
- Produces: `parsePlan(relPath: string, text: string): { plan: LearningPlan | null; issues: PlanIssue[] }`
  - 仅当 frontmatter `type === 'learning-plan'` 的文件才会被调用（发现逻辑在 Task 4）
  - 致命问题（缺 goal / status 非法）→ `plan: null` + issues；checkbox 出现在任何 `## 主题` 之前 → 记 issue 但不致命
  - `extractWikiLinks(text: string): string[]` 同文件导出（Task 4 复用）

- [ ] **Step 1: 写失败测试**

`test/plan-parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parsePlan } from '../src/plan/parse.js'

const GOOD = `---
type: learning-plan
goal: 学习 Rust
status: active
created: 2026-07-06
---
## 所有权与借用
- [x] 所有权基础 [[Rust所有权笔记]]
- [ ] 生命周期标注
## 并发
- [ ] async 基础
`

describe('parsePlan', () => {
  it('parses topics, items, links and done state', () => {
    const { plan, issues } = parsePlan('计划/rust.md', GOOD)
    expect(issues).toEqual([])
    expect(plan?.goal).toBe('学习 Rust')
    expect(plan?.status).toBe('active')
    expect(plan?.topics).toHaveLength(2)
    expect(plan?.topics[0].items[0]).toMatchObject({ done: true, links: ['Rust所有权笔记'] })
    expect(plan?.topics[1].items[0].text).toBe('async 基础')
  })

  it('missing goal is fatal', () => {
    const { plan, issues } = parsePlan('坏计划.md', '---\ntype: learning-plan\n---\n## 主题\n- [ ] x\n')
    expect(plan).toBeNull()
    expect(issues[0].message).toContain('goal')
  })

  it('invalid status is fatal', () => {
    const { plan, issues } = parsePlan('p.md', '---\ntype: learning-plan\ngoal: g\nstatus: wip\n---\n')
    expect(plan).toBeNull()
    expect(issues[0].message).toContain('status')
  })

  it('checkbox before any topic yields non-fatal issue', () => {
    const { plan, issues } = parsePlan('p.md', '---\ntype: learning-plan\ngoal: g\n---\n- [ ] 游离项\n## 主题\n- [ ] ok\n')
    expect(plan).not.toBeNull()
    expect(plan?.topics[0].items).toHaveLength(1)
    expect(issues.some(i => i.message.includes('游离'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- plan-parse`
Expected: FAIL（Cannot find module '../src/plan/parse.js'）

- [ ] **Step 3: 实现**

`src/plan/parse.ts`:

```ts
import { parseFrontmatter } from '../protocol/frontmatter.js'
import type { LearningPlan, PlanIssue, PlanStatus, PlanTopic } from '../protocol/types.js'

const STATUSES: PlanStatus[] = ['active', 'paused', 'done']
const WIKI_RE = /\[\[([^\]|#\n]+)(?:[#|][^\]]*)?\]\]/g
const TOPIC_RE = /^##\s+(.+)$/
const ITEM_RE = /^-\s+\[([ xX])\]\s+(.+)$/

export function extractWikiLinks(text: string): string[] {
  return [...text.matchAll(WIKI_RE)].map(m => m[1].trim())
}

export function parsePlan(relPath: string, text: string): { plan: LearningPlan | null; issues: PlanIssue[] } {
  const issues: PlanIssue[] = []
  const { attrs, body } = parseFrontmatter(text)

  const goal = typeof attrs.goal === 'string' ? attrs.goal.trim() : ''
  if (!goal) issues.push({ path: relPath, line: 1, message: 'frontmatter 缺少 goal' })

  const rawStatus = attrs.status ?? 'active'
  const status = STATUSES.includes(rawStatus as PlanStatus) ? (rawStatus as PlanStatus) : null
  if (!status) issues.push({ path: relPath, line: 1, message: `status 非法：${String(rawStatus)}（应为 ${STATUSES.join('/')}）` })

  const created = typeof attrs.created === 'string' ? attrs.created : String(attrs.created ?? '')

  const fmLines = text.slice(0, text.length - body.length).split('\n').length - 1
  const topics: PlanTopic[] = []
  body.split('\n').forEach((raw, i) => {
    const line = fmLines + i + 1
    const t = raw.match(TOPIC_RE)
    if (t) {
      topics.push({ title: t[1].trim(), items: [], line })
      return
    }
    const item = raw.match(ITEM_RE)
    if (item) {
      const last = topics[topics.length - 1]
      if (!last) {
        issues.push({ path: relPath, line, message: '游离学习项：checkbox 出现在任何 "## 主题" 之前，已忽略' })
        return
      }
      last.items.push({ text: item[2].trim(), done: item[1] !== ' ', links: extractWikiLinks(item[2]), line })
    }
  })

  if (!goal || !status) return { plan: null, issues }
  return { plan: { path: relPath, goal, status, created, topics }, issues }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- plan-parse && npm run typecheck`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 学习计划解析与校验"
```

---

### Task 4: vault 扫描与计划发现

**Files:**
- Create: `src/vault/scanner.ts`
- Create: `test/fixtures/vault/计划/rust.md`, `test/fixtures/vault/笔记/Rust所有权笔记.md`, `test/fixtures/vault/笔记/无关笔记.md`, `test/fixtures/vault/坏计划.md`, `test/fixtures/vault/_assistant/daily/2026-06-29.md`
- Test: `test/scanner.test.ts`

**Interfaces:**
- Consumes: `parsePlan`、`extractWikiLinks`、`parseFrontmatter`
- Produces: `scanVault(root: string): Promise<ScanResult>`
  - 递归收集 `*.md`；跳过目录 `.git` `.obsidian` `.trash` `_assistant`
  - `notes` 含所有收集文件（title = 文件名去 .md，links = 全文 wiki 链接，mtimeMs）
  - frontmatter `type === 'learning-plan'` 的文件走 `parsePlan`，成功进 `plans`，issues 汇入 `planIssues`
  - `path` 一律相对 root、`/` 分隔

- [ ] **Step 1: 建 fixture vault**

`test/fixtures/vault/计划/rust.md`（内容 = Task 3 测试里的 GOOD 常量原文）。

`test/fixtures/vault/笔记/Rust所有权笔记.md`:

```markdown
# Rust 所有权

move 语义与 [[借用检查器]]。
```

`test/fixtures/vault/笔记/无关笔记.md`:

```markdown
# 无关笔记

日常记录。
```

`test/fixtures/vault/坏计划.md`:

```markdown
---
type: learning-plan
---
## 主题
- [ ] x
```

`test/fixtures/vault/_assistant/daily/2026-06-29.md`:

```markdown
---
generated-by: margin-assistant
---
旧的生成物，扫描时必须被排除。
```

- [ ] **Step 2: 写失败测试**

`test/scanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { scanVault } from '../src/vault/scanner.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')

describe('scanVault', () => {
  it('collects notes, discovers plans by frontmatter, excludes _assistant', async () => {
    const result = await scanVault(FIXTURE)
    const paths = result.notes.map(n => n.path)
    expect(paths).toContain('笔记/Rust所有权笔记.md')
    expect(paths.some(p => p.startsWith('_assistant/'))).toBe(false)
    expect(result.plans).toHaveLength(1)
    expect(result.plans[0].goal).toBe('学习 Rust')
    expect(result.planIssues.some(i => i.path === '坏计划.md')).toBe(true)
    const note = result.notes.find(n => n.path === '笔记/Rust所有权笔记.md')
    expect(note?.title).toBe('Rust所有权笔记')
    expect(note?.links).toContain('借用检查器')
    expect(note!.mtimeMs).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- scanner`
Expected: FAIL（Cannot find module '../src/vault/scanner.js'）

- [ ] **Step 4: 实现**

`src/vault/scanner.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from '../protocol/frontmatter.js'
import { parsePlan, extractWikiLinks } from '../plan/parse.js'
import type { ScanResult, VaultNote } from '../protocol/types.js'

const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', '_assistant'])

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name), root, out)
    } else if (entry.name.endsWith('.md')) {
      out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'))
    }
  }
}

export async function scanVault(root: string): Promise<ScanResult> {
  const files: string[] = []
  await walk(root, root, files)
  const result: ScanResult = { root, notes: [], plans: [], planIssues: [] }

  for (const rel of files.sort()) {
    const abs = path.join(root, rel)
    const [text, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)])
    const note: VaultNote = {
      path: rel,
      title: path.basename(rel, '.md'),
      mtimeMs: stat.mtimeMs,
      links: extractWikiLinks(text),
    }
    result.notes.push(note)

    const { attrs } = parseFrontmatter(text)
    if (attrs.type === 'learning-plan') {
      const { plan, issues } = parsePlan(rel, text)
      if (plan) result.plans.push(plan)
      result.planIssues.push(...issues)
    }
  }
  return result
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- scanner && npm run typecheck`
Expected: 1 passed。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: vault 扫描与 frontmatter 计划发现"
```

---

### Task 5: 笔记活跃度（git 历史 + mtime 兜底）

**Files:**
- Create: `src/vault/activity.ts`
- Test: `test/activity.test.ts`

**Interfaces:**
- Consumes: `ScanResult`
- Produces: `getLastActive(scan: ScanResult): Promise<Map<string, number>>`
  - key = note.path（相对路径），value = 最近活跃时间 ms
  - root 是 git 仓库时：一次 `git log` 取每文件最近提交时间；git 有记录的文件用 `max(git 时间, mtime)`（未提交的新改动也算活跃），无记录的文件用 mtime
  - 非 git 仓库：全部用 mtime

- [ ] **Step 1: 写失败测试**

`test/activity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanVault } from '../src/vault/scanner.js'
import { getLastActive } from '../src/vault/activity.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')

describe('getLastActive', () => {
  it('falls back to mtime for non-git vault', async () => {
    const scan = await scanVault(FIXTURE)
    const activity = await getLastActive(scan)
    const note = scan.notes.find(n => n.path === '笔记/无关笔记.md')!
    expect(activity.get(note.path)).toBe(note.mtimeMs)
  })

  it('uses git commit time for tracked files in a git vault', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-git-'))
    const git = (...args: string[]) => execFileSync('git', ['-C', tmp, ...args])
    git('init', '-b', 'main')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    fs.writeFileSync(path.join(tmp, 'a.md'), '# a\n')
    git('add', '.')
    git('commit', '-m', 'init', '--date', '2026-01-01T00:00:00Z')

    const scan = await scanVault(tmp)
    const activity = await getLastActive(scan)
    // mtime（刚写入）晚于提交时间，取 max 应为 mtime
    expect(activity.get('a.md')).toBe(scan.notes[0].mtimeMs)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- activity`
Expected: FAIL（Cannot find module '../src/vault/activity.js'）

- [ ] **Step 3: 实现**

`src/vault/activity.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ScanResult } from '../protocol/types.js'

const run = promisify(execFile)

async function gitTimes(root: string): Promise<Map<string, number> | null> {
  try {
    await run('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'])
    const { stdout } = await run(
      'git',
      ['-C', root, 'log', '--format=@%ct', '--name-only', '--no-renames'],
      { maxBuffer: 64 * 1024 * 1024 },
    )
    const times = new Map<string, number>()
    let current = 0
    for (const line of stdout.split('\n')) {
      if (line.startsWith('@')) current = Number(line.slice(1)) * 1000
      else if (line.trim() && !times.has(line.trim())) times.set(line.trim(), current)
    }
    return times
  } catch {
    return null
  }
}

export async function getLastActive(scan: ScanResult): Promise<Map<string, number>> {
  const git = await gitTimes(scan.root)
  const result = new Map<string, number>()
  for (const note of scan.notes) {
    const t = git?.get(note.path)
    result.set(note.path, t ? Math.max(t, note.mtimeMs) : note.mtimeMs)
  }
  return result
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- activity && npm run typecheck`
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 笔记活跃度（git 历史 + mtime 兜底）"
```

---

### Task 6: 进度引擎与快照

**Files:**
- Create: `src/progress/engine.ts`, `src/progress/snapshot.ts`
- Test: `test/progress.test.ts`

**Interfaces:**
- Consumes: `ScanResult`、`getLastActive` 的活跃度 Map、协议进度类型
- Produces:
  - `computeProgress(scan: ScanResult, activity: Map<string, number>, now: Date, staleDays?: number): ProgressReport`（默认 staleDays=7；只统计 `status === 'active'` 的计划；`nextItems` = 按主题顺序每主题第一个未完成项，最多 3 个；`staleTopics` = 未完成且 `daysIdle >= staleDays` 的主题名；链接解析按 note.title 匹配，主题 lastActive = 主题内所有关联笔记活跃度最大值，无链接为 null）
  - `saveSnapshot(vaultRoot: string, date: string, report: ProgressReport): Promise<void>` → 写 `_assistant/.state/progress/<date>.json`
  - `loadSnapshot(vaultRoot: string, date: string): Promise<ProgressReport | null>`
  - `isoDate(d: Date): string`（`YYYY-MM-DD`，本地时区）

- [ ] **Step 1: 写失败测试**

`test/progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { scanVault } from '../src/vault/scanner.js'
import { computeProgress } from '../src/progress/engine.js'
import { saveSnapshot, loadSnapshot, isoDate } from '../src/progress/snapshot.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')

describe('computeProgress', () => {
  it('computes completion, next items and stale topics', async () => {
    const scan = await scanVault(FIXTURE)
    const now = new Date('2026-07-06T08:00:00Z')
    // 人工构造活跃度：所有权笔记 10 天前活跃
    const activity = new Map<string, number>()
    activity.set('笔记/Rust所有权笔记.md', now.getTime() - 10 * 86400_000)
    const report = computeProgress(scan, activity, now)

    expect(report.plans).toHaveLength(1)
    const p = report.plans[0]
    expect(p).toMatchObject({ goal: '学习 Rust', done: 1, total: 3 })
    expect(p.completion).toBeCloseTo(1 / 3)
    expect(p.nextItems[0]).toEqual({ topic: '所有权与借用', text: '生命周期标注' })
    const ownership = p.topics.find(t => t.title === '所有权与借用')!
    expect(ownership.daysIdle).toBe(10)
    expect(p.staleTopics).toContain('所有权与借用')
    const concurrency = p.topics.find(t => t.title === '并发')!
    expect(concurrency.lastActiveMs).toBeNull()
    expect(p.staleTopics).not.toContain('并发')
  })
})

describe('snapshot', () => {
  it('saves and loads by date', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-snap-'))
    const report = { generatedAt: 'x', plans: [] }
    await saveSnapshot(tmp, '2026-07-06', report)
    expect(await loadSnapshot(tmp, '2026-07-06')).toEqual(report)
    expect(await loadSnapshot(tmp, '2026-01-01')).toBeNull()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('isoDate formats', () => {
    expect(isoDate(new Date(2026, 6, 6))).toBe('2026-07-06')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- progress`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/progress/engine.ts`:

```ts
import type { PlanProgress, ProgressReport, ScanResult, TopicProgress } from '../protocol/types.js'

const DAY = 86400_000

export function computeProgress(
  scan: ScanResult,
  activity: Map<string, number>,
  now: Date,
  staleDays = 7,
): ProgressReport {
  const byTitle = new Map(scan.notes.map(n => [n.title, n.path]))

  const plans: PlanProgress[] = scan.plans
    .filter(p => p.status === 'active')
    .map(plan => {
      const topics: TopicProgress[] = plan.topics.map(topic => {
        let lastActiveMs: number | null = null
        for (const item of topic.items) {
          for (const link of item.links) {
            const notePath = byTitle.get(link)
            const t = notePath ? activity.get(notePath) : undefined
            if (t !== undefined) lastActiveMs = Math.max(lastActiveMs ?? 0, t)
          }
        }
        const done = topic.items.filter(i => i.done).length
        return {
          title: topic.title,
          done,
          total: topic.items.length,
          lastActiveMs,
          daysIdle: lastActiveMs === null ? null : Math.floor((now.getTime() - lastActiveMs) / DAY),
        }
      })

      const done = topics.reduce((s, t) => s + t.done, 0)
      const total = topics.reduce((s, t) => s + t.total, 0)
      const nextItems: { topic: string; text: string }[] = []
      for (const topic of plan.topics) {
        const next = topic.items.find(i => !i.done)
        if (next && nextItems.length < 3) nextItems.push({ topic: topic.title, text: next.text })
      }
      return {
        path: plan.path,
        goal: plan.goal,
        done,
        total,
        completion: total === 0 ? 0 : done / total,
        topics,
        nextItems,
        staleTopics: topics
          .filter(t => t.done < t.total && t.daysIdle !== null && t.daysIdle >= staleDays)
          .map(t => t.title),
      }
    })

  return { generatedAt: now.toISOString(), plans }
}
```

`src/progress/snapshot.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProgressReport } from '../protocol/types.js'

function snapPath(vaultRoot: string, date: string): string {
  return path.join(vaultRoot, '_assistant', '.state', 'progress', `${date}.json`)
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function saveSnapshot(vaultRoot: string, date: string, report: ProgressReport): Promise<void> {
  const file = snapPath(vaultRoot, date)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf8')
}

export async function loadSnapshot(vaultRoot: string, date: string): Promise<ProgressReport | null> {
  try {
    return JSON.parse(await fs.readFile(snapPath(vaultRoot, date), 'utf8')) as ProgressReport
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- progress && npm run typecheck`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 进度引擎与 .state 快照"
```

---

### Task 7: config 加载与 CLI 骨架（scan / plan / progress 接线）

**Files:**
- Create: `src/config.ts`, `src/cli.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: Task 2-6 全部导出
- Produces:
  - `loadConfig(vaultRoot: string): Promise<AssistantConfig>`；`AssistantConfig = { llm?: { model?: string; api_key_env?: string }; sources?: SourceConfig[]; stale_days?: number }`；`SourceConfig = { type: string } & Record<string, unknown>`（两类型定义在 `src/config.ts` 导出）；config 文件缺失返回 `{}`
  - `runCli(argv: string[], print?: (s: string) => void): Promise<number>`（argv 不含 node 与脚本名；vault 取 `--vault` 或 env `MA_VAULT`，缺失时 stderr 报错返回 2）
  - 本任务接线：`ma scan`（ScanResult JSON）、`ma plan list`（plans JSON）、`ma plan check`（issues JSON，有 issue 退出码 1）、`ma progress`（ProgressReport JSON，`--now <iso>` 可覆盖当前时间）
  - `cli.ts` 首行 shebang `#!/usr/bin/env node`，文件尾部：直接执行时调用 `runCli(process.argv.slice(2))` 并以返回值 `process.exit`

- [ ] **Step 1: 写失败测试**

`test/cli.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { runCli } from '../src/cli.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')

async function run(args: string[]): Promise<{ code: number; out: string }> {
  let out = ''
  const code = await runCli(args, s => { out += s + '\n' })
  return { code, out }
}

describe('cli', () => {
  it('scan outputs ScanResult json', async () => {
    const { code, out } = await run(['scan', '--vault', FIXTURE])
    expect(code).toBe(0)
    const parsed = JSON.parse(out)
    expect(parsed.plans).toHaveLength(1)
  })

  it('plan check exits 1 when issues exist', async () => {
    const { code, out } = await run(['plan', 'check', '--vault', FIXTURE])
    expect(code).toBe(1)
    expect(JSON.parse(out).some((i: { path: string }) => i.path === '坏计划.md')).toBe(true)
  })

  it('progress honors --now', async () => {
    const { code, out } = await run(['progress', '--vault', FIXTURE, '--now', '2026-07-06T08:00:00Z'])
    expect(code).toBe(0)
    expect(JSON.parse(out).generatedAt).toBe('2026-07-06T08:00:00.000Z')
  })

  it('missing vault is an error', async () => {
    delete process.env.MA_VAULT
    const { code } = await run(['scan'])
    expect(code).toBe(2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- cli`
Expected: FAIL（Cannot find module '../src/cli.js'）

- [ ] **Step 3: 实现**

`src/config.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'

export interface SourceConfig { type: string; [k: string]: unknown }
export interface AssistantConfig {
  llm?: { model?: string; api_key_env?: string }
  sources?: SourceConfig[]
  stale_days?: number
}

export async function loadConfig(vaultRoot: string): Promise<AssistantConfig> {
  try {
    const text = await fs.readFile(path.join(vaultRoot, '_assistant', 'config.yaml'), 'utf8')
    return (yaml.load(text) as AssistantConfig) ?? {}
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
}
```

`src/cli.ts`:

```ts
#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { scanVault } from './vault/scanner.js'
import { getLastActive } from './vault/activity.js'
import { computeProgress } from './progress/engine.js'
import { loadConfig } from './config.js'

const USAGE = 'usage: ma <scan|plan list|plan check|progress> --vault <path> [--now <iso>]'

export async function runCli(argv: string[], print: (s: string) => void = console.log): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      vault: { type: 'string' },
      now: { type: 'string' },
    },
  })
  const [cmd, sub] = positionals
  const vault = values.vault ?? process.env.MA_VAULT
  if (!cmd) { console.error(USAGE); return 2 }
  if (!vault) { console.error('缺少 --vault（或设置 MA_VAULT）'); return 2 }
  const now = values.now ? new Date(values.now) : new Date()

  const config = await loadConfig(vault)
  const scan = await scanVault(vault)

  switch (`${cmd} ${sub ?? ''}`.trim()) {
    case 'scan':
      print(JSON.stringify(scan, null, 2))
      return 0
    case 'plan list':
      print(JSON.stringify(scan.plans, null, 2))
      return 0
    case 'plan check':
      print(JSON.stringify(scan.planIssues, null, 2))
      return scan.planIssues.length > 0 ? 1 : 0
    case 'progress': {
      const activity = await getLastActive(scan)
      const report = computeProgress(scan, activity, now, config.stale_days)
      print(JSON.stringify(report, null, 2))
      return 0
    }
    default:
      console.error(USAGE)
      return 2
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli(process.argv.slice(2)).then(code => process.exit(code))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- cli && npm run typecheck && npm run build && node dist/cli.js scan --vault test/fixtures/vault | head -3`
Expected: 4 passed；build 成功；stdout 出现 `{`。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: config 加载与 CLI 骨架（scan/plan/progress）"
```

---

### Task 8: 连接器接口 + Hacker News + 去重缓存 + fetch 接线

**Files:**
- Create: `src/connectors/types.ts`, `src/connectors/hackernews.ts`, `src/connectors/index.ts`, `src/connectors/cache.ts`
- Modify: `src/cli.ts`（case 增加 `fetch`）
- Test: `test/connectors-hn.test.ts`

**Interfaces:**
- Consumes: `FeedItem`、`SourceConfig`
- Produces:
  - `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>`（`connectors/types.ts`）
  - `fetchHackerNews(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]>`（Algolia `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=<limit??20>`；id 形如 `hn:<objectID>`；无 url 的帖子用 `https://news.ycombinator.com/item?id=<objectID>`）
  - `fetchSource(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]>`（`connectors/index.ts` 按 type 分发，未知 type 抛错；Task 9 在此登记 rss/github）
  - `filterUnseen(vaultRoot: string, items: FeedItem[]): Promise<FeedItem[]>` 与 `markSeen(vaultRoot: string, items: FeedItem[]): Promise<void>`（`.state/seen-items.json`，存 id 数组，上限 5000 条 FIFO）
  - CLI：`ma fetch --vault <path>` 读取 config.sources，逐源抓取（单源失败仅 stderr 警告不中断），过滤已见后输出 `{ items: FeedItem[], failures: { source: string; error: string }[] }` JSON；**不** markSeen（只有 `ma report` 落盘成功后才标记）

- [ ] **Step 1: 写失败测试**

`test/connectors-hn.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fetchHackerNews } from '../src/connectors/hackernews.js'
import { filterUnseen, markSeen } from '../src/connectors/cache.js'
import type { Fetcher } from '../src/connectors/types.js'

const SAMPLE = {
  hits: [
    { objectID: '1', title: 'Rust 2.0 announced', url: 'https://blog.rust-lang.org/2', points: 500, created_at: '2026-07-05T00:00:00Z' },
    { objectID: '2', title: 'Ask HN: editors?', url: null, points: 100, created_at: '2026-07-05T01:00:00Z' },
  ],
}
const fakeFetch: Fetcher = async () => new Response(JSON.stringify(SAMPLE), { status: 200 })

describe('hackernews connector', () => {
  it('maps hits to FeedItems with fallback url', async () => {
    const items = await fetchHackerNews({ type: 'hackernews' }, fakeFetch)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ source: 'hackernews', id: 'hn:1', url: 'https://blog.rust-lang.org/2' })
    expect(items[1].url).toBe('https://news.ycombinator.com/item?id=2')
  })
})

describe('seen cache', () => {
  it('filters seen items after markSeen', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-seen-'))
    const items = await fetchHackerNews({ type: 'hackernews' }, fakeFetch)
    expect(await filterUnseen(tmp, items)).toHaveLength(2)
    await markSeen(tmp, [items[0]])
    const rest = await filterUnseen(tmp, items)
    expect(rest.map(i => i.id)).toEqual(['hn:2'])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- connectors-hn`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/connectors/types.ts`:

```ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
```

`src/connectors/hackernews.ts`:

```ts
import type { FeedItem } from '../protocol/types.js'
import type { SourceConfig } from '../config.js'
import type { Fetcher } from './types.js'

interface HnHit { objectID: string; title: string; url: string | null; points: number; created_at: string }

export async function fetchHackerNews(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]> {
  const limit = typeof cfg.limit === 'number' ? cfg.limit : 20
  const res = await fetchFn(`https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`)
  if (!res.ok) throw new Error(`hackernews: HTTP ${res.status}`)
  const data = (await res.json()) as { hits: HnHit[] }
  return data.hits.map(h => ({
    source: 'hackernews',
    id: `hn:${h.objectID}`,
    title: h.title,
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    summary: `${h.points} points`,
    publishedAt: h.created_at,
  }))
}
```

`src/connectors/cache.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import type { FeedItem } from '../protocol/types.js'

const MAX_SEEN = 5000

function seenPath(vaultRoot: string): string {
  return path.join(vaultRoot, '_assistant', '.state', 'seen-items.json')
}

async function loadSeen(vaultRoot: string): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(seenPath(vaultRoot), 'utf8')) as string[]
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

export async function filterUnseen(vaultRoot: string, items: FeedItem[]): Promise<FeedItem[]> {
  const seen = new Set(await loadSeen(vaultRoot))
  return items.filter(i => !seen.has(i.id))
}

export async function markSeen(vaultRoot: string, items: FeedItem[]): Promise<void> {
  const seen = await loadSeen(vaultRoot)
  const merged = [...seen, ...items.map(i => i.id).filter(id => !seen.includes(id))].slice(-MAX_SEEN)
  const file = seenPath(vaultRoot)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(merged), 'utf8')
}
```

`src/connectors/index.ts`:

```ts
import type { FeedItem } from '../protocol/types.js'
import type { SourceConfig } from '../config.js'
import type { Fetcher } from './types.js'
import { fetchHackerNews } from './hackernews.js'

export async function fetchSource(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]> {
  switch (cfg.type) {
    case 'hackernews': return fetchHackerNews(cfg, fetchFn)
    default: throw new Error(`未知数据源类型：${cfg.type}`)
  }
}

export interface FetchAllResult { items: FeedItem[]; failures: { source: string; error: string }[] }

export async function fetchAll(sources: SourceConfig[], fetchFn: Fetcher): Promise<FetchAllResult> {
  const result: FetchAllResult = { items: [], failures: [] }
  for (const cfg of sources) {
    try {
      result.items.push(...(await fetchSource(cfg, fetchFn)))
    } catch (e) {
      result.failures.push({ source: cfg.type, error: (e as Error).message })
    }
  }
  return result
}
```

`src/cli.ts` 的 switch 中、`default` 之前插入（并在文件头部加 import）：

```ts
    case 'fetch': {
      const { fetchAll } = await import('./connectors/index.js')
      const { filterUnseen } = await import('./connectors/cache.js')
      const all = await fetchAll(config.sources ?? [], fetch)
      for (const f of all.failures) console.error(`源 ${f.source} 抓取失败：${f.error}`)
      const items = await filterUnseen(vault, all.items)
      print(JSON.stringify({ items, failures: all.failures }, null, 2))
      return 0
    }
```

同时更新 `USAGE` 常量为 `usage: ma <scan|plan list|plan check|progress|fetch> --vault <path> [--now <iso>]`。

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npm run typecheck`
Expected: 全部通过（含此前任务的用例）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 连接器接口、HN 连接器、去重缓存与 fetch 命令"
```

---

### Task 9: RSS 与 GitHub 连接器

**Files:**
- Create: `src/connectors/rss.ts`, `src/connectors/github.ts`
- Modify: `src/connectors/index.ts`（登记两个 type）
- Test: `test/connectors-rss-github.test.ts`

**Interfaces:**
- Consumes: `Fetcher`、`FeedItem`、`SourceConfig`
- Produces:
  - `fetchRss(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]>`（cfg.url 必填；支持 RSS2 `rss.channel.item` 与 Atom `feed.entry`；id 形如 `rss:<link 或 guid>`）
  - `fetchGithub(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]>`（GitHub Search API 近 `days??7` 天新建仓库按星排序，`language` 可选、`limit??10`；id 形如 `github:<full_name>`。注：Trending 无官方 API，本连接器以"近期高星新仓库"为语义，README 中如实说明）

- [ ] **Step 1: 写失败测试**

`test/connectors-rss-github.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fetchRss } from '../src/connectors/rss.js'
import { fetchGithub } from '../src/connectors/github.js'
import type { Fetcher } from '../src/connectors/types.js'

const RSS2 = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
<item><title>Post A</title><link>https://b.com/a</link><description>desc a</description><pubDate>Sun, 05 Jul 2026 00:00:00 GMT</pubDate></item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Feed</title>
<entry><title>Entry B</title><link href="https://b.com/b"/><summary>desc b</summary><updated>2026-07-05T00:00:00Z</updated></entry>
</feed>`

const GH = { items: [{ full_name: 'rust-lang/rust', html_url: 'https://github.com/rust-lang/rust', description: 'lang', stargazers_count: 99999, created_at: '2026-07-01T00:00:00Z' }] }

const mk = (body: string): Fetcher => async () => new Response(body, { status: 200 })

describe('rss connector', () => {
  it('parses RSS2', async () => {
    const items = await fetchRss({ type: 'rss', url: 'https://b.com/feed' }, mk(RSS2))
    expect(items[0]).toMatchObject({ source: 'rss', title: 'Post A', url: 'https://b.com/a', summary: 'desc a' })
  })
  it('parses Atom single entry', async () => {
    const items = await fetchRss({ type: 'rss', url: 'https://b.com/atom' }, mk(ATOM))
    expect(items[0]).toMatchObject({ title: 'Entry B', url: 'https://b.com/b' })
  })
})

describe('github connector', () => {
  it('maps search results', async () => {
    const items = await fetchGithub({ type: 'github', language: 'rust' }, mk(JSON.stringify(GH)))
    expect(items[0]).toMatchObject({ source: 'github', id: 'github:rust-lang/rust', title: 'rust-lang/rust' })
    expect(items[0].summary).toContain('lang')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- connectors-rss-github`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/connectors/rss.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import type { FeedItem } from '../protocol/types.js'
import type { SourceConfig } from '../config.js'
import type { Fetcher } from './types.js'

function arr<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x]
}

export async function fetchRss(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]> {
  if (typeof cfg.url !== 'string') throw new Error('rss: 缺少 url')
  const res = await fetchFn(cfg.url)
  if (!res.ok) throw new Error(`rss ${cfg.url}: HTTP ${res.status}`)
  const doc = new XMLParser({ ignoreAttributes: false }).parse(await res.text())

  interface Rss2Item { title?: unknown; link?: unknown; description?: unknown; guid?: unknown; pubDate?: unknown }
  interface AtomLink { '@_href'?: string }
  interface AtomEntry { title?: unknown; link?: AtomLink | AtomLink[]; summary?: unknown; updated?: unknown }

  const rss2 = arr<Rss2Item>(doc.rss?.channel?.item).map(i => {
    const link = typeof i.link === 'string' ? i.link : ''
    return {
      source: 'rss',
      id: `rss:${String(i.guid ?? link)}`,
      title: String(i.title ?? ''),
      url: link,
      summary: i.description === undefined ? undefined : String(i.description),
      publishedAt: i.pubDate === undefined ? undefined : String(i.pubDate),
    }
  })
  const atom = arr<AtomEntry>(doc.feed?.entry).map(e => {
    const link = arr(e.link).map(l => l['@_href']).find(h => h) ?? ''
    return {
      source: 'rss',
      id: `rss:${link}`,
      title: String(e.title ?? ''),
      url: link,
      summary: e.summary === undefined ? undefined : String(e.summary),
      publishedAt: e.updated === undefined ? undefined : String(e.updated),
    }
  })
  return [...rss2, ...atom]
}
```

`src/connectors/github.ts`:

```ts
import type { FeedItem } from '../protocol/types.js'
import type { SourceConfig } from '../config.js'
import type { Fetcher } from './types.js'

interface Repo { full_name: string; html_url: string; description: string | null; stargazers_count: number; created_at: string }

export async function fetchGithub(cfg: SourceConfig, fetchFn: Fetcher): Promise<FeedItem[]> {
  const days = typeof cfg.days === 'number' ? cfg.days : 7
  const limit = typeof cfg.limit === 'number' ? cfg.limit : 10
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const lang = typeof cfg.language === 'string' ? `+language:${encodeURIComponent(cfg.language)}` : ''
  const url = `https://api.github.com/search/repositories?q=created:%3E${since}${lang}&sort=stars&order=desc&per_page=${limit}`
  const res = await fetchFn(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'margin-assistant' } })
  if (!res.ok) throw new Error(`github: HTTP ${res.status}`)
  const data = (await res.json()) as { items: Repo[] }
  return data.items.map(r => ({
    source: 'github',
    id: `github:${r.full_name}`,
    title: r.full_name,
    url: r.html_url,
    summary: `${r.stargazers_count}★ ${r.description ?? ''}`.trim(),
    publishedAt: r.created_at,
  }))
}
```

`src/connectors/index.ts` 的 switch 中登记：

```ts
    case 'rss': {
      const { fetchRss } = await import('./rss.js')
      return fetchRss(cfg, fetchFn)
    }
    case 'github': {
      const { fetchGithub } = await import('./github.js')
      return fetchGithub(cfg, fetchFn)
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: RSS 与 GitHub 连接器"
```

---

### Task 10: LLM 客户端与 prompt 模板

**Files:**
- Create: `src/llm/client.ts`, `src/llm/prompts.ts`
- Test: `test/llm.test.ts`

**Interfaces:**
- Consumes: `AssistantConfig`、`ProgressReport`、`FeedItem`
- Produces:
  - `interface LlmClient { complete(system: string, user: string): Promise<string> }`
  - `createLlmClient(config: AssistantConfig): LlmClient | null`（key 取 `process.env[config.llm?.api_key_env ?? 'ANTHROPIC_API_KEY']`，无 key 返回 null；model 默认 `claude-sonnet-4-6`）
  - `dailyAdvicePrompt(report: ProgressReport): { system: string; user: string }`
  - `relevancePrompt(items: FeedItem[], topics: string[], noteTitles: string[]): { system: string; user: string }`
  - `parseRelevance(text: string): Map<string, { relevance: number; reason: string; related: string[] }>`（提取首个 `[`到末个 `]` 的 JSON 数组；解析失败抛错，由调用方降级）
  - `roadmapPrompt(goal: string): { system: string; user: string }`

- [ ] **Step 1: 写失败测试**

`test/llm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createLlmClient } from '../src/llm/client.js'
import { dailyAdvicePrompt, relevancePrompt, parseRelevance, roadmapPrompt } from '../src/llm/prompts.js'

describe('createLlmClient', () => {
  it('returns null without api key', () => {
    delete process.env.MA_TEST_KEY
    expect(createLlmClient({ llm: { api_key_env: 'MA_TEST_KEY' } })).toBeNull()
  })
})

describe('prompts', () => {
  it('daily advice embeds progress json and forbids fabrication', () => {
    const { system, user } = dailyAdvicePrompt({ generatedAt: 'x', plans: [] })
    expect(system).toContain('不得编造')
    expect(user).toContain('"plans"')
  })

  it('relevance prompt lists topics and note titles', () => {
    const { user } = relevancePrompt(
      [{ source: 'hackernews', id: 'hn:1', title: 'Rust news', url: 'u' }],
      ['所有权与借用'],
      ['Rust所有权笔记'],
    )
    expect(user).toContain('所有权与借用')
    expect(user).toContain('hn:1')
  })

  it('parseRelevance extracts json array from noisy text', () => {
    const map = parseRelevance('评分如下：\n[{"id":"hn:1","relevance":8,"reason":"直接相关","related":["Rust所有权笔记"]}]\n完。')
    expect(map.get('hn:1')).toEqual({ relevance: 8, reason: '直接相关', related: ['Rust所有权笔记'] })
  })

  it('parseRelevance throws on garbage', () => {
    expect(() => parseRelevance('无法评分')).toThrow()
  })

  it('roadmap prompt constrains output shape', () => {
    const { system } = roadmapPrompt('学习 Rust')
    expect(system).toContain('## ')
    expect(system).toContain('- [ ]')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- llm`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/llm/client.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { AssistantConfig } from '../config.js'

export interface LlmClient {
  complete(system: string, user: string): Promise<string>
}

export function createLlmClient(config: AssistantConfig): LlmClient | null {
  const key = process.env[config.llm?.api_key_env ?? 'ANTHROPIC_API_KEY']
  if (!key) return null
  const model = config.llm?.model ?? 'claude-sonnet-4-6'
  const sdk = new Anthropic({ apiKey: key })
  return {
    async complete(system, user) {
      const res = await sdk.messages.create({
        model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      })
      return res.content.filter(b => b.type === 'text').map(b => b.text).join('')
    },
  }
}
```

`src/llm/prompts.ts`:

```ts
import type { FeedItem, ProgressReport } from '../protocol/types.js'

export function dailyAdvicePrompt(report: ProgressReport): { system: string; user: string } {
  return {
    system: [
      '你是个人知识库的学习助手。基于用户学习计划的结构化进度 JSON，用中文写一段今日学习建议。',
      '要求：1) 明确今天学哪 1-2 个学习项（从 nextItems 里选）并说明为什么；',
      '2) 若 staleTopics 非空，提醒复习；3) 语气克制务实，不超过 200 字；',
      '4) 不得编造 JSON 中不存在的进度或主题。只输出 markdown 正文，不要标题。',
    ].join('\n'),
    user: JSON.stringify(report, null, 2),
  }
}

export function relevancePrompt(items: FeedItem[], topics: string[], noteTitles: string[]): { system: string; user: string } {
  return {
    system: [
      '你为资讯条目与用户学习主题的相关性打分（0-10 整数），并给一句中文理由。',
      'related 字段只能从给出的笔记标题列表中选（0-2 个），没有就给空数组。',
      '只输出 JSON 数组，元素形如 {"id":"...","relevance":8,"reason":"...","related":["..."]}，不要其他文字。',
    ].join('\n'),
    user: JSON.stringify(
      {
        topics,
        noteTitles,
        items: items.map(i => ({ id: i.id, title: i.title, summary: i.summary ?? '' })),
      },
      null,
      2,
    ),
  }
}

export function parseRelevance(text: string): Map<string, { relevance: number; reason: string; related: string[] }> {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('LLM 相关性输出中未找到 JSON 数组')
  const parsed = JSON.parse(text.slice(start, end + 1)) as { id: string; relevance: number; reason?: string; related?: string[] }[]
  return new Map(parsed.map(e => [e.id, { relevance: e.relevance, reason: e.reason ?? '', related: e.related ?? [] }]))
}

export function roadmapPrompt(goal: string): { system: string; user: string } {
  return {
    system: [
      '你为给定学习目标生成 markdown 学习路线图正文（中文）。',
      '结构：3-6 个 "## 主题" 小节，每个主题 3-6 个 "- [ ] 学习项"。',
      '由浅入深排列。只输出正文，不要 frontmatter、不要一级标题、不要解释。',
    ].join('\n'),
    user: `学习目标：${goal}`,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- llm && npm run typecheck`
Expected: 6 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: LLM 客户端与 prompt 模板"
```

---

### Task 11: 渲染器与安全写入

**Files:**
- Create: `src/render/write.ts`, `src/render/daily.ts`, `src/render/report.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `serializeFrontmatter`/`parseFrontmatter`、`ProgressReport`、`ScoredItem`
- Produces:
  - `writeGenerated(absPath: string, content: string): Promise<void>`（目标已存在且 frontmatter `generated-by !== 'margin-assistant'` 时抛错；自动建目录）
  - `renderDaily(input: DailyInput): string`；`DailyInput = { date: string; advice: string; report: ProgressReport; degraded: boolean; prevCompletion?: Map<string, number>; now: Date }`（frontmatter：`generated-by`/`generated-at`/`type: assistant-daily`/`degraded`；正文含「## 建议」「## 进度一览」（有 prevCompletion 时附「较上周 +x%」）「## 复习提醒」）
  - `renderReport(input: ReportInput): string`；`ReportInput = { date: string; items: ScoredItem[]; failures: { source: string; error: string }[]; degraded: boolean; now: Date }`（frontmatter 同上但 `type: assistant-report`；条目按 relevance 降序（null 视为 -1），格式 `- [title](url) — reason（relevance/10）｜相关：[[note]]`；failures 渲染尾部「## 数据源状态」）
  - `degradedAdvice(report: ProgressReport): string`（规则文案：下一步学习项列表 + 复习提醒列表；`renderDaily` 不自动调用，由编排层传入 advice）

- [ ] **Step 1: 写失败测试**

`test/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeGenerated } from '../src/render/write.js'
import { renderDaily, degradedAdvice } from '../src/render/daily.js'
import { renderReport } from '../src/render/report.js'
import { parseFrontmatter } from '../src/protocol/frontmatter.js'
import type { ProgressReport, ScoredItem } from '../src/protocol/types.js'

const REPORT: ProgressReport = {
  generatedAt: '2026-07-06T08:00:00.000Z',
  plans: [{
    path: '计划/rust.md', goal: '学习 Rust', done: 1, total: 3, completion: 1 / 3,
    topics: [
      { title: '所有权与借用', done: 1, total: 2, lastActiveMs: 1, daysIdle: 10 },
      { title: '并发', done: 0, total: 1, lastActiveMs: null, daysIdle: null },
    ],
    nextItems: [{ topic: '所有权与借用', text: '生命周期标注' }],
    staleTopics: ['所有权与借用'],
  }],
}
const NOW = new Date('2026-07-06T08:00:00Z')

describe('writeGenerated', () => {
  it('writes new file and overwrites own generated file, refuses foreign file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-write-'))
    const target = path.join(tmp, 'daily', 'x.md')
    await writeGenerated(target, '---\ngenerated-by: margin-assistant\n---\nv1\n')
    await writeGenerated(target, '---\ngenerated-by: margin-assistant\n---\nv2\n')
    expect(fs.readFileSync(target, 'utf8')).toContain('v2')
    const foreign = path.join(tmp, 'user.md')
    fs.writeFileSync(foreign, '# 用户文件\n')
    await expect(writeGenerated(foreign, 'x')).rejects.toThrow(/拒绝覆盖/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('renderDaily', () => {
  it('renders protocol frontmatter and sections', () => {
    const text = renderDaily({ date: '2026-07-06', advice: '今天学生命周期。', report: REPORT, degraded: false, now: NOW })
    const { attrs, body } = parseFrontmatter(text)
    expect(attrs['generated-by']).toBe('margin-assistant')
    expect(attrs.type).toBe('assistant-daily')
    expect(attrs.degraded).toBe(false)
    expect(body).toContain('## 建议')
    expect(body).toContain('学习 Rust')
    expect(body).toContain('1/3')
    expect(body).toContain('「所有权与借用」已 10 天未碰')
  })

  it('degradedAdvice lists next items', () => {
    const text = degradedAdvice(REPORT)
    expect(text).toContain('生命周期标注')
  })
})

describe('renderReport', () => {
  it('sorts by relevance and renders failures', () => {
    const items: ScoredItem[] = [
      { source: 'hackernews', id: 'hn:1', title: 'A', url: 'https://a', relevance: 3, reason: 'r1', related: [] },
      { source: 'rss', id: 'rss:2', title: 'B', url: 'https://b', relevance: 9, reason: 'r2', related: ['Rust所有权笔记'] },
    ]
    const text = renderReport({ date: '2026-07-06', items, failures: [{ source: 'github', error: 'HTTP 500' }], degraded: false, now: NOW })
    expect(text.indexOf('[B](https://b)')).toBeLessThan(text.indexOf('[A](https://a)'))
    expect(text).toContain('[[Rust所有权笔记]]')
    expect(text).toContain('github 源不可用')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- render`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/render/write.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from '../protocol/frontmatter.js'

export async function writeGenerated(absPath: string, content: string): Promise<void> {
  let existing: string | null = null
  try {
    existing = await fs.readFile(absPath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (existing !== null) {
    const { attrs } = parseFrontmatter(existing)
    if (attrs['generated-by'] !== 'margin-assistant') {
      throw new Error(`拒绝覆盖非生成文件：${absPath}`)
    }
  }
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf8')
}
```

`src/render/daily.ts`:

```ts
import { serializeFrontmatter } from '../protocol/frontmatter.js'
import type { ProgressReport } from '../protocol/types.js'

export interface DailyInput {
  date: string
  advice: string
  report: ProgressReport
  degraded: boolean
  prevCompletion?: Map<string, number>
  now: Date
}

export function degradedAdvice(report: ProgressReport): string {
  const lines: string[] = ['（规则建议：LLM 不可用）', '']
  for (const p of report.plans) {
    for (const n of p.nextItems) lines.push(`- 继续「${p.goal}」：${n.topic} → ${n.text}`)
  }
  if (lines.length === 2) lines.push('- 所有计划的学习项都已完成，考虑新目标或复盘。')
  return lines.join('\n')
}

export function renderDaily(input: DailyInput): string {
  const { report } = input
  const body: string[] = [`# 今日学习 · ${input.date}`, '', '## 建议', '', input.advice.trim(), '', '## 进度一览', '']
  for (const p of report.plans) {
    const pct = Math.round(p.completion * 100)
    const prev = input.prevCompletion?.get(p.path)
    const delta = prev === undefined ? '' : `，较上周 ${pct - Math.round(prev * 100) >= 0 ? '+' : ''}${pct - Math.round(prev * 100)}%`
    body.push(`- **${p.goal}**：${p.done}/${p.total}（${pct}%${delta}）`)
    for (const t of p.topics) {
      const idle = t.daysIdle === null ? '无关联笔记活动' : `最近活跃 ${t.daysIdle} 天前`
      body.push(`  - ${t.title} ${t.done}/${t.total}，${idle}`)
    }
  }
  body.push('', '## 复习提醒', '')
  const stale = report.plans.flatMap(p => p.staleTopics.map(t => `- 「${t}」已 ${p.topics.find(x => x.title === t)?.daysIdle} 天未碰`))
  body.push(...(stale.length ? stale : ['- 暂无']))
  body.push('')
  return serializeFrontmatter(
    {
      'generated-by': 'margin-assistant',
      'generated-at': input.now.toISOString(),
      type: 'assistant-daily',
      degraded: input.degraded,
    },
    body.join('\n'),
  )
}
```

`src/render/report.ts`:

```ts
import { serializeFrontmatter } from '../protocol/frontmatter.js'
import type { ScoredItem } from '../protocol/types.js'

export interface ReportInput {
  date: string
  items: ScoredItem[]
  failures: { source: string; error: string }[]
  degraded: boolean
  now: Date
}

export function renderReport(input: ReportInput): string {
  const sorted = [...input.items].sort((a, b) => (b.relevance ?? -1) - (a.relevance ?? -1))
  const body: string[] = [`# 资讯日报 · ${input.date}`, '']
  if (input.degraded) body.push('（降级模式：未做相关性筛选）', '')
  for (const i of sorted) {
    const score = i.relevance === null ? '' : `（${i.relevance}/10）`
    const reason = i.reason ? ` — ${i.reason}` : ''
    const related = i.related.length ? `｜相关：${i.related.map(r => `[[${r}]]`).join(' ')}` : ''
    body.push(`- [${i.title}](${i.url})${reason}${score}${related}`)
  }
  if (!sorted.length) body.push('- 今日无新条目')
  if (input.failures.length) {
    body.push('', '## 数据源状态', '')
    for (const f of input.failures) body.push(`- ${f.source} 源不可用：${f.error}`)
  }
  body.push('')
  return serializeFrontmatter(
    {
      'generated-by': 'margin-assistant',
      'generated-at': input.now.toISOString(),
      type: 'assistant-report',
      degraded: input.degraded,
    },
    body.join('\n'),
  )
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- render && npm run typecheck`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: daily/report 渲染器与 generated-by 安全写入"
```

---

### Task 12: `ma daily` 编排（含降级与快照）

**Files:**
- Create: `src/commands/daily.ts`
- Modify: `src/cli.ts`（case 增加 `daily`）
- Test: `test/daily.test.ts`

**Interfaces:**
- Consumes: `scanVault`/`getLastActive`/`computeProgress`/`saveSnapshot`/`loadSnapshot`/`isoDate`/`createLlmClient`/`dailyAdvicePrompt`/`degradedAdvice`/`renderDaily`/`writeGenerated`/`AssistantConfig`
- Produces: `runDaily(vault: string, config: AssistantConfig, now: Date, llm: LlmClient | null): Promise<{ path: string; degraded: boolean }>`
  - 流程：scan → activity → progress → 快照存 `<今日>.json` → 取 7 天前快照做 prevCompletion → advice（llm 存在则 `complete(dailyAdvicePrompt)`，失败或无 llm 用 `degradedAdvice`，degraded=true）→ renderDaily → writeGenerated 到 `_assistant/daily/<date>.md`
  - CLI：`ma daily --vault <path> [--now <iso>]`，成功打印 `{ "path": ..., "degraded": ... }` JSON

- [ ] **Step 1: 写失败测试**

`test/daily.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runDaily } from '../src/commands/daily.js'
import { parseFrontmatter } from '../src/protocol/frontmatter.js'
import type { LlmClient } from '../src/llm/client.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')
const NOW = new Date('2026-07-06T08:00:00Z')

function cloneVault(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-daily-'))
  fs.cpSync(FIXTURE, tmp, { recursive: true })
  return tmp
}

describe('runDaily', () => {
  it('degrades without llm and writes protocol file + snapshot', async () => {
    const vault = cloneVault()
    const { path: outPath, degraded } = await runDaily(vault, {}, NOW, null)
    expect(degraded).toBe(true)
    expect(outPath.endsWith('_assistant/daily/2026-07-06.md')).toBe(true)
    const { attrs, body } = parseFrontmatter(fs.readFileSync(outPath, 'utf8'))
    expect(attrs.degraded).toBe(true)
    expect(body).toContain('生命周期标注')
    expect(fs.existsSync(path.join(vault, '_assistant/.state/progress/2026-07-06.json'))).toBe(true)
    fs.rmSync(vault, { recursive: true, force: true })
  })

  it('uses llm advice when available, degrades on llm failure', async () => {
    const vault = cloneVault()
    const good: LlmClient = { complete: async () => '今天精读生命周期。' }
    const r1 = await runDaily(vault, {}, NOW, good)
    expect(r1.degraded).toBe(false)
    expect(fs.readFileSync(r1.path, 'utf8')).toContain('今天精读生命周期。')

    const bad: LlmClient = { complete: async () => { throw new Error('boom') } }
    const r2 = await runDaily(vault, {}, NOW, bad)
    expect(r2.degraded).toBe(true)
    fs.rmSync(vault, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- daily`
Expected: FAIL（Cannot find module '../src/commands/daily.js'）

- [ ] **Step 3: 实现**

`src/commands/daily.ts`:

```ts
import path from 'node:path'
import { scanVault } from '../vault/scanner.js'
import { getLastActive } from '../vault/activity.js'
import { computeProgress } from '../progress/engine.js'
import { saveSnapshot, loadSnapshot, isoDate } from '../progress/snapshot.js'
import { dailyAdvicePrompt } from '../llm/prompts.js'
import { renderDaily, degradedAdvice } from '../render/daily.js'
import { writeGenerated } from '../render/write.js'
import type { LlmClient } from '../llm/client.js'
import type { AssistantConfig } from '../config.js'

export async function runDaily(
  vault: string,
  config: AssistantConfig,
  now: Date,
  llm: LlmClient | null,
): Promise<{ path: string; degraded: boolean }> {
  const scan = await scanVault(vault)
  const activity = await getLastActive(scan)
  const report = computeProgress(scan, activity, now, config.stale_days)
  const date = isoDate(now)
  await saveSnapshot(vault, date, report)

  const weekAgo = isoDate(new Date(now.getTime() - 7 * 86400_000))
  const prev = await loadSnapshot(vault, weekAgo)
  const prevCompletion = prev ? new Map(prev.plans.map(p => [p.path, p.completion])) : undefined

  let advice: string
  let degraded: boolean
  if (llm) {
    try {
      const { system, user } = dailyAdvicePrompt(report)
      advice = await llm.complete(system, user)
      degraded = false
    } catch (e) {
      console.error(`LLM 调用失败，走降级：${(e as Error).message}`)
      advice = degradedAdvice(report)
      degraded = true
    }
  } else {
    advice = degradedAdvice(report)
    degraded = true
  }

  const outPath = path.join(vault, '_assistant', 'daily', `${date}.md`)
  await writeGenerated(outPath, renderDaily({ date, advice, report, degraded, prevCompletion, now }))
  return { path: outPath, degraded }
}
```

`src/cli.ts` 的 switch 中、`default` 之前插入：

```ts
    case 'daily': {
      const { runDaily } = await import('./commands/daily.js')
      const { createLlmClient } = await import('./llm/client.js')
      const result = await runDaily(vault, config, now, createLlmClient(config))
      print(JSON.stringify(result, null, 2))
      return 0
    }
```

`USAGE` 增补 `daily`。

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npm run typecheck`
Expected: 全部通过（此为降级模式全链路 E2E，纯确定性可进 CI）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ma daily 编排（LLM 建议 + 规则降级 + 周趋势快照）"
```

---

### Task 13: `ma report` 编排（含降级与 markSeen）

**Files:**
- Create: `src/commands/report.ts`
- Modify: `src/cli.ts`（case 增加 `report`）
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: `fetchAll`/`filterUnseen`/`markSeen`/`relevancePrompt`/`parseRelevance`/`renderReport`/`writeGenerated`/`scanVault`/`isoDate`/`LlmClient`/`Fetcher`
- Produces: `runReport(vault: string, config: AssistantConfig, now: Date, llm: LlmClient | null, fetchFn: Fetcher): Promise<{ path: string; degraded: boolean; kept: number }>`
  - 流程：fetchAll(config.sources) → filterUnseen → 若 llm：scan 取 topics（active 计划的主题名）与 noteTitles（计划项引用的链接目标），`relevancePrompt` + `parseRelevance` 打分，保留 `relevance >= 6` 降序；llm 缺失/失败：全量保留 relevance=null、degraded=true → renderReport → writeGenerated 到 `_assistant/reports/<date>.md` → **写入成功后** markSeen（本次抓到的全部条目，含被筛掉的，避免明日重复评审）
  - CLI：`ma report --vault <path> [--now <iso>]`，打印 `{ path, degraded, kept }` JSON

- [ ] **Step 1: 写失败测试**

`test/report.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runReport } from '../src/commands/report.js'
import type { LlmClient } from '../src/llm/client.js'
import type { Fetcher } from '../src/connectors/types.js'
import type { AssistantConfig } from '../src/config.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/vault')
const NOW = new Date('2026-07-06T08:30:00Z')
const CONFIG: AssistantConfig = { sources: [{ type: 'hackernews' }] }

const HN = { hits: [
  { objectID: '1', title: 'Rust lifetimes deep dive', url: 'https://a', points: 300, created_at: '2026-07-05T00:00:00Z' },
  { objectID: '2', title: 'Cooking tips', url: 'https://b', points: 50, created_at: '2026-07-05T00:00:00Z' },
] }
const fakeFetch: Fetcher = async () => new Response(JSON.stringify(HN), { status: 200 })

function cloneVault(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-report-'))
  fs.cpSync(FIXTURE, tmp, { recursive: true })
  return tmp
}

describe('runReport', () => {
  it('scores with llm, keeps relevant, marks all seen', async () => {
    const vault = cloneVault()
    const llm: LlmClient = {
      complete: async () =>
        '[{"id":"hn:1","relevance":9,"reason":"生命周期直接相关","related":["Rust所有权笔记"]},{"id":"hn:2","relevance":1,"reason":"无关","related":[]}]',
    }
    const r = await runReport(vault, CONFIG, NOW, llm, fakeFetch)
    expect(r).toMatchObject({ degraded: false, kept: 1 })
    const text = fs.readFileSync(r.path, 'utf8')
    expect(text).toContain('Rust lifetimes deep dive')
    expect(text).not.toContain('Cooking tips')
    expect(text).toContain('[[Rust所有权笔记]]')
    // 再跑一次：全部已 seen，kept=0
    const r2 = await runReport(vault, CONFIG, NOW, llm, fakeFetch)
    expect(r2.kept).toBe(0)
    fs.rmSync(vault, { recursive: true, force: true })
  })

  it('degrades to unfiltered list without llm', async () => {
    const vault = cloneVault()
    const r = await runReport(vault, CONFIG, NOW, null, fakeFetch)
    expect(r).toMatchObject({ degraded: true, kept: 2 })
    expect(fs.readFileSync(r.path, 'utf8')).toContain('Cooking tips')
    fs.rmSync(vault, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- report`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/commands/report.ts`:

```ts
import path from 'node:path'
import { scanVault } from '../vault/scanner.js'
import { fetchAll } from '../connectors/index.js'
import { filterUnseen, markSeen } from '../connectors/cache.js'
import { relevancePrompt, parseRelevance } from '../llm/prompts.js'
import { renderReport } from '../render/report.js'
import { writeGenerated } from '../render/write.js'
import { isoDate } from '../progress/snapshot.js'
import type { LlmClient } from '../llm/client.js'
import type { Fetcher } from '../connectors/types.js'
import type { AssistantConfig } from '../config.js'
import type { ScoredItem } from '../protocol/types.js'

const KEEP_THRESHOLD = 6

export async function runReport(
  vault: string,
  config: AssistantConfig,
  now: Date,
  llm: LlmClient | null,
  fetchFn: Fetcher,
): Promise<{ path: string; degraded: boolean; kept: number }> {
  const all = await fetchAll(config.sources ?? [], fetchFn)
  for (const f of all.failures) console.error(`源 ${f.source} 抓取失败：${f.error}`)
  const fresh = await filterUnseen(vault, all.items)

  let scored: ScoredItem[]
  let degraded: boolean
  if (llm && fresh.length > 0) {
    try {
      const scan = await scanVault(vault)
      const activePlans = scan.plans.filter(p => p.status === 'active')
      const topics = activePlans.flatMap(p => p.topics.map(t => t.title))
      const noteTitles = [...new Set(activePlans.flatMap(p => p.topics.flatMap(t => t.items.flatMap(i => i.links))))]
      const { system, user } = relevancePrompt(fresh, topics, noteTitles)
      const scores = parseRelevance(await llm.complete(system, user))
      scored = fresh
        .map(i => ({ ...i, relevance: scores.get(i.id)?.relevance ?? 0, reason: scores.get(i.id)?.reason, related: scores.get(i.id)?.related ?? [] }))
        .filter(i => (i.relevance ?? 0) >= KEEP_THRESHOLD)
      degraded = false
    } catch (e) {
      console.error(`LLM 相关性筛选失败，走降级：${(e as Error).message}`)
      scored = fresh.map(i => ({ ...i, relevance: null, related: [] }))
      degraded = true
    }
  } else {
    scored = fresh.map(i => ({ ...i, relevance: null, related: [] }))
    degraded = llm === null
  }

  const date = isoDate(now)
  const outPath = path.join(vault, '_assistant', 'reports', `${date}.md`)
  await writeGenerated(outPath, renderReport({ date, items: scored, failures: all.failures, degraded, now }))
  await markSeen(vault, fresh)
  return { path: outPath, degraded, kept: scored.length }
}
```

`src/cli.ts` 的 switch 中、`default` 之前插入：

```ts
    case 'report': {
      const { runReport } = await import('./commands/report.js')
      const { createLlmClient } = await import('./llm/client.js')
      const result = await runReport(vault, config, now, createLlmClient(config), fetch)
      print(JSON.stringify(result, null, 2))
      return 0
    }
```

`USAGE` 增补 `report`。

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ma report 编排（相关性筛选 + 降级 + seen 标记）"
```

---

### Task 14: `ma plan create`（LLM 路线图生成，永不覆盖）

**Files:**
- Create: `src/commands/plan-create.ts`
- Modify: `src/cli.ts`（`plan create` 分支 + `--goal`/`--out` 选项）
- Test: `test/plan-create.test.ts`

**Interfaces:**
- Consumes: `roadmapPrompt`/`LlmClient`/`serializeFrontmatter`/`parsePlan`/`isoDate`
- Produces: `runPlanCreate(vault: string, goal: string, outRel: string, now: Date, llm: LlmClient | null): Promise<{ path: string }>`
  - llm 为 null → 抛错（此命令无降级：没有 LLM 生成不了路线图）
  - LLM 输出先用 `parsePlan` 校验（拼装成完整文档后解析），不合法则抛错并附 issues
  - 用 `fs.writeFile(abs, text, { flag: 'wx' })` 写入——文件已存在即报错，**永不覆盖**（spec 3.1/3.2）
  - CLI：`ma plan create --vault <path> --goal "学习 X" --out "学习X计划.md"`，成功打印 `{ path }`

- [ ] **Step 1: 写失败测试**

`test/plan-create.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runPlanCreate } from '../src/commands/plan-create.js'
import { parseFrontmatter } from '../src/protocol/frontmatter.js'
import type { LlmClient } from '../src/llm/client.js'

const NOW = new Date('2026-07-06T08:00:00Z')
const ROADMAP = '## 基础\n- [ ] 安装工具链\n- [ ] hello world\n## 进阶\n- [ ] 泛型\n'
const llm: LlmClient = { complete: async () => ROADMAP }

describe('runPlanCreate', () => {
  it('writes a valid learning-plan note', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-create-'))
    const { path: out } = await runPlanCreate(vault, '学习 Zig', '学习Zig计划.md', NOW, llm)
    const { attrs, body } = parseFrontmatter(fs.readFileSync(out, 'utf8'))
    expect(attrs).toMatchObject({ type: 'learning-plan', goal: '学习 Zig', status: 'active', created: '2026-07-06' })
    expect(body).toContain('- [ ] 安装工具链')
    fs.rmSync(vault, { recursive: true, force: true })
  })

  it('never overwrites an existing file', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-create-'))
    fs.writeFileSync(path.join(vault, '已有.md'), '用户内容')
    await expect(runPlanCreate(vault, 'g', '已有.md', NOW, llm)).rejects.toThrow()
    expect(fs.readFileSync(path.join(vault, '已有.md'), 'utf8')).toBe('用户内容')
    fs.rmSync(vault, { recursive: true, force: true })
  })

  it('requires llm', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-create-'))
    await expect(runPlanCreate(vault, 'g', 'x.md', NOW, null)).rejects.toThrow(/LLM/)
    fs.rmSync(vault, { recursive: true, force: true })
  })

  it('rejects invalid llm output', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-create-'))
    const bad: LlmClient = { complete: async () => '抱歉我不会。' }
    await expect(runPlanCreate(vault, 'g', 'x.md', NOW, bad)).rejects.toThrow(/路线图/)
    fs.rmSync(vault, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- plan-create`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现**

`src/commands/plan-create.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { serializeFrontmatter } from '../protocol/frontmatter.js'
import { parsePlan } from '../plan/parse.js'
import { roadmapPrompt } from '../llm/prompts.js'
import { isoDate } from '../progress/snapshot.js'
import type { LlmClient } from '../llm/client.js'

export async function runPlanCreate(
  vault: string,
  goal: string,
  outRel: string,
  now: Date,
  llm: LlmClient | null,
): Promise<{ path: string }> {
  if (!llm) throw new Error('plan create 需要 LLM（请配置 API key），无降级路径')
  const { system, user } = roadmapPrompt(goal)
  const body = await llm.complete(system, user)
  const text = serializeFrontmatter(
    { type: 'learning-plan', goal, status: 'active', created: isoDate(now) },
    body.trim() + '\n',
  )
  const { plan, issues } = parsePlan(outRel, text)
  if (!plan || plan.topics.length === 0 || plan.topics.every(t => t.items.length === 0)) {
    throw new Error(`LLM 生成的路线图不合法：${issues.map(i => i.message).join('；') || '无主题或无学习项'}`)
  }
  const abs = path.join(vault, outRel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, text, { flag: 'wx' })
  return { path: abs }
}
```

`src/cli.ts`：options 增加 `goal: { type: 'string' }, out: { type: 'string' }`；switch 增加：

```ts
    case 'plan create': {
      if (!values.goal || !values.out) { console.error('plan create 需要 --goal 与 --out'); return 2 }
      const { runPlanCreate } = await import('./commands/plan-create.js')
      const { createLlmClient } = await import('./llm/client.js')
      const result = await runPlanCreate(vault, values.goal, values.out, now, createLlmClient(config))
      print(JSON.stringify(result, null, 2))
      return 0
    }
```

注意：`plan create` 分支必须放在 `plan list`/`plan check` 同级 switch 中；`USAGE` 增补。另外 `runCli` 顶层需要 try/catch 把命令抛错转为 stderr + 退出码 1（本任务补上，包住整个 switch）：

```ts
  try {
    // ...原 switch...
  } catch (e) {
    console.error((e as Error).message)
    return 1
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ma plan create（LLM 路线图生成，wx 永不覆盖）"
```

---

### Task 15: Hermes 宿主层与 launchd 退出通道

**Files:**
- Create: `hosts/hermes/README.md`, `hosts/hermes/skills/daily-learning.md`, `hosts/hermes/skills/daily-report.md`, `hosts/hermes/skills/progress-chat.md`, `hosts/launchd/com.margin-assistant.daily.plist`, `hosts/launchd/com.margin-assistant.report.plist`, `hosts/launchd/README.md`

**Interfaces:**
- Consumes: 内核 CLI（`ma daily` / `ma report` / `ma progress`，经 `npm run build` 后 `node dist/cli.js`）
- Produces: 可直接照做的宿主接入文档与配置；无代码、无单测，验证方式 = 文件齐全 + launchd 命令可手动执行

- [ ] **Step 1: 写 Hermes skill 定义**

`hosts/hermes/skills/daily-learning.md`:

```markdown
---
name: daily-learning
description: 每天早 8:00 生成今日学习建议并推送
schedule: "0 8 * * *"
---

# 每日学习 job

1. 运行：`node <REPO>/dist/cli.js daily --vault "$MA_VAULT"`
2. 命令 stdout 是 JSON `{ "path": "...", "degraded": true|false }`；非零退出码时把 stderr 原文推送给用户并停止。
3. 读取 path 指向的 markdown 文件，把「## 建议」小节全文 + 各计划的完成度行推送到 IM。
4. degraded 为 true 时在消息开头注明「（今日为规则降级建议，LLM 不可用）」。
5. 禁止修改 vault 内任何文件——本 job 只读内核产物。
```

`hosts/hermes/skills/daily-report.md`:

```markdown
---
name: daily-report
description: 每天早 8:30 生成资讯日报并推送
schedule: "30 8 * * *"
---

# 每日情报 job

1. 运行：`node <REPO>/dist/cli.js report --vault "$MA_VAULT"`
2. stdout 是 JSON `{ "path": "...", "degraded": ..., "kept": N }`；非零退出码时推送 stderr 并停止。
3. kept 为 0 时推送「今日无新的相关资讯」；否则读取 path 文件，推送前 5 条条目（保留链接）。
4. 禁止修改 vault 内任何文件。
```

`hosts/hermes/skills/progress-chat.md`:

```markdown
---
name: progress-chat
description: 回答学习进度问题；修改计划需用户明确确认
---

# 进度问答 skill

- 用户问进度/该学什么时：先运行 `node <REPO>/dist/cli.js progress --vault "$MA_VAULT"`，
  只依据返回 JSON 中的数字回答，禁止编造任何 JSON 里不存在的进度、主题或百分比。
- 用户要求修改学习计划（增删学习项、勾选、改目标）时：
  1. 先复述将要做的修改（哪个文件、哪一行、改成什么）；
  2. 等用户明确回复确认后，才允许编辑对应 learning-plan 文件；
  3. 未确认前绝不落盘。这是硬规则（spec：计划不静默改写）。
- 用户要新建计划时：确认目标与文件名后运行
  `node <REPO>/dist/cli.js plan create --vault "$MA_VAULT" --goal "<目标>" --out "<文件名>.md"`。
```

- [ ] **Step 2: 写 Hermes README**

`hosts/hermes/README.md`:

```markdown
# Hermes 宿主接入

内核与 Hermes 之间只有两种界面：CLI 调用与 vault 文件。Hermes 侧永远不 import 内核代码。

## 前置

1. 内核构建：仓库根目录 `npm install && npm run build`
2. 环境变量（Hermes 运行环境内）：
   - `MA_VAULT=/Users/jianjustin/Library/CloudStorage/OneDrive-个人/笔记库`
   - `ANTHROPIC_API_KEY=<key>`（缺失时内核自动降级，不会报错）
3. vault 内创建 `_assistant/config.yaml`，样例：

    ```yaml
    llm:
      model: claude-sonnet-4-6
    sources:
      - type: hackernews
        limit: 20
      - type: github
        language: rust
      - type: rss
        url: https://blog.rust-lang.org/feed.xml
    stale_days: 7
    ```

## 接入步骤

1. 按 Hermes 当前版本文档注册 `skills/` 下三个 skill（daily-learning、daily-report、progress-chat），
   把文中 `<REPO>` 替换为本仓库绝对路径。
2. cron 表达式已写在 skill frontmatter（8:00 / 8:30）。

## 安全基线（不可妥协）

- IM 网关只绑定私人 bot，开启用户白名单；不配置任何公网 webhook。
- Hermes 进程以当前用户运行，仅授予 vault 与本仓库目录的读写。
- 两个定时 job 对 vault 只读（写入全部由内核完成并受 generated-by 保护）。

## GitHub 连接器语义说明

GitHub Trending 无官方 API，`type: github` 实际为「近 N 天新建的高星仓库」（Search API），
接近但不等于 Trending 页面。
```

- [ ] **Step 3: 写 launchd 退出通道**

`hosts/launchd/com.margin-assistant.daily.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.margin-assistant.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/jianjustin/workspaces/margin-assistant/dist/cli.js</string>
    <string>daily</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MA_VAULT</key>
    <string>/Users/jianjustin/Library/CloudStorage/OneDrive-个人/笔记库</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardErrorPath</key><string>/tmp/margin-assistant-daily.err</string>
</dict>
</plist>
```

`hosts/launchd/com.margin-assistant.report.plist`：同上，Label 为 `com.margin-assistant.report`，ProgramArguments 第三项为 `report`，Minute 为 30，StandardErrorPath 为 `/tmp/margin-assistant-report.err`。

`hosts/launchd/README.md`:

```markdown
# launchd 退出通道

不跑 Hermes 时的纯本地方案（损失 IM 推送与对话，产物照常写入 vault）：

1. `npm run build`
2. 按需修改两个 plist 里的 node 路径（`which node`）与 vault 路径
3. `cp *.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.margin-assistant.*.plist`
4. 手动触发验证：`launchctl start com.margin-assistant.daily`
5. API key 建议写入 plist 的 EnvironmentVariables（注意该文件权限）或改用 shell 包装脚本读取 Keychain
```

- [ ] **Step 4: 验证**

Run: `ls hosts/hermes/skills hosts/launchd && npm run build && node dist/cli.js daily --vault test/fixtures/vault --now 2026-07-06T08:00:00Z && git -C test/fixtures/vault status 2>/dev/null; git checkout -- test/fixtures/vault 2>/dev/null || true`

Expected: 7 个文件齐全；`daily` 在 fixture vault 上真实跑通（降级模式）输出 JSON。注意最后把 fixture vault 里新生成的 `_assistant/daily/2026-07-06.md` 与 `.state/` 清理掉（`git status` 检查后 `git clean -fd test/fixtures/vault` 或手动删除），保持 fixture 干净。

- [ ] **Step 5: Commit**

```bash
git status   # 确认 fixture 无残留
git add hosts
git commit -m "docs: Hermes 宿主 skill 定义与 launchd 退出通道"
```

---

### Task 16: README 与协议文档

**Files:**
- Create: `README.md`, `docs/protocol.md`

**Interfaces:**
- Consumes: 全部已实现命令
- Produces: 仓库门面文档；协议文档是 margin 阶段二（只读感知）开发时的对接依据

- [ ] **Step 1: 写 README.md**

```markdown
# margin-assistant

margin/Obsidian vault 的知识库助手内核：每日学习建议 + 资讯日报。
厚内核架构——LLM 编排与 prompt 都在本仓库；宿主（Hermes / launchd）只做调度与推送。
设计 spec 见 margin 仓库 `docs/superpowers/specs/2026-07-06-knowledge-assistant-design.md`。

## 安装与构建

    npm install && npm run build
    # 可选：npm link 后直接用 `ma`

## 命令

| 命令 | 作用 | 输出 |
|---|---|---|
| `ma scan --vault <path>` | 扫描 vault（笔记/计划/校验问题） | ScanResult JSON |
| `ma plan list` | 列出学习计划 | plans JSON |
| `ma plan check` | 校验计划，有问题退出码 1 | issues JSON |
| `ma plan create --goal "学习 X" --out "计划.md"` | LLM 生成路线图（永不覆盖已有文件） | `{path}` |
| `ma progress [--now iso]` | 规则进度报告 | ProgressReport JSON |
| `ma fetch` | 抓取数据源（不标记已读） | `{items, failures}` |
| `ma daily` | 生成今日学习建议写入 `_assistant/daily/` | `{path, degraded}` |
| `ma report` | 生成资讯日报写入 `_assistant/reports/` | `{path, degraded, kept}` |

所有命令支持 `--vault` 或环境变量 `MA_VAULT`。

## LLM 与降级

API key 取 `ANTHROPIC_API_KEY`（可在 `_assistant/config.yaml` 的 `llm.api_key_env` 改名）。
无 key / LLM 失败时 `daily`、`report` 自动降级为纯规则输出并在产物 frontmatter 标 `degraded: true`；
`plan create` 无降级路径。

## 宿主

- Hermes（推荐，IM 推送 + 对话）：见 `hosts/hermes/README.md`
- launchd（纯本地退出通道）：见 `hosts/launchd/README.md`

## 写入安全

内核只覆盖 frontmatter 带 `generated-by: margin-assistant` 的文件；
`_assistant/` 之外仅 `plan create` 允许新建（已存在报错）；绝不修改用户笔记与已有计划。
```

- [ ] **Step 2: 写 docs/protocol.md**

内容 = spec 第 3 节「文件协议」的独立化版本，必须包含：learning-plan frontmatter 字段表（type/goal/status/created，status 枚举）、主题与学习项的 markdown 结构约定、`_assistant/` 目录布局、生成物 frontmatter 字段表（generated-by/generated-at/type: assistant-daily|assistant-report/degraded）、进度信号三条定义（checkbox / 关联笔记活跃度 git+mtime / N 天未碰）、写入安全规则四条。可从 spec 复制改写，落款注明「本文件是协议的权威定义，margin 阶段二按此对接」。

- [ ] **Step 3: 验证与全量回归**

Run: `npm test && npm run typecheck && npm run build`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README 与文件协议权威文档"
```

---

## Self-Review 记录

1. **Spec 覆盖**：spec 2（厚内核+降级）→ Task 10/12/13；spec 3.1（frontmatter 发现、双入口、不静默改写、create 不覆盖）→ Task 3/4/14；spec 3.2（目录、generated-by 保护）→ Task 6/11；spec 3.3（进度信号）→ Task 5/6；spec 4（模块与 CLI）→ Task 2-14；spec 5（Hermes 三 skill + 退出通道 + 安全基线）→ Task 15；spec 6（错误处理：源隔离 Task 8、LLM 降级 Task 12/13、解析失败不参与 Task 3/4、幂等 Task 11、Hermes 不可用 Task 15）；spec 7（测试策略：fixture vault、回放、快照式断言、mock LLM、降级 E2E）→ 各任务；spec 8 阶段一即本计划，阶段二三不做。
2. **占位符**：无 TBD；Task 16 protocol.md 给出了必含内容清单而非全文，属于"从 spec 复制改写"的明确指令，执行者有完整来源。
3. **类型一致性**：`runCli(argv, print)`、`LlmClient.complete(system, user)`、`Fetcher`、`ScoredItem.related`、`isoDate` 等跨任务签名已逐一核对；Task 12/13 消费的所有函数均在 Task 2-11 的 Produces 中定义。
