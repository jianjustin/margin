# Margin Typora 化 + 稳定性 + 性能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `/` 菜单时开时不开；补齐图片内联、checkbox 点击、表格交互、链接跳转、脚注预览；加崩溃恢复与外部冲突检测；大文档按键路径 < 2ms。

**Architecture:** CodeMirror 6 live-preview 装饰层（StateField + 新增视口 ViewPlugin），Tauri 2 后端命令扩展（草稿读写），Zustand 文档 store 扩展（draft/conflict/epoch）。Spec 见 `docs/superpowers/specs/2026-06-10-typora-wysiwyg-stability-perf-design.md`。

**Tech Stack:** React 18 + CodeMirror 6 + Zustand + Tauri 2（Rust）+ vitest（node/jsdom 双环境）。

**通用命令**（每个 Task 末尾验证）：
- `npm run typecheck` → 全绿
- `npx vitest run` → 全部通过
- `cargo test --manifest-path src-tauri/Cargo.toml` → 全部通过（仅 Rust 改动时必须）

**与 spec 的两处已确认偏差**（实现更简单、行为等价）：
1. 草稿文件名用「相对路径百分号编码」而非 sha1（Rust std 无 sha1，避免新依赖；可逆、确定）。
2. 草稿恢复条件只看「草稿内容 ≠ 磁盘内容」，不比 mtime（草稿在每次保存成功后即删除，残留草稿本身就意味着异常退出）。

---

## Task 1: 提交现有已验证工作（阶段 0）

**Files:** 无新改动 — 仅提交工作区现有内容。

- [ ] **Step 1: 全量验证现有改动**

```bash
npm run typecheck && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: 全部通过（基线：28 文件 / 127 用例 + Rust 12 用例）。失败则停下排查，不许带病提交。

- [ ] **Step 2: 提交 perf + slash 抽取（编辑器侧）**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/StatusBar.tsx \
  src/renderer/src/components/FileTree/Sidebar.tsx src/renderer/src/components/Editor.tsx \
  src/renderer/src/editor/livePreview/livePreviewPlugin.ts src/renderer/src/editor/slashTrigger.ts \
  test/statusBar-dom.test.tsx test/app-rerender.test.tsx test/perf/ \
  test/slashTrigger.test.ts test/slashMenu-dom.test.tsx docs/perf-report.md
git commit -m "perf: eliminate per-keystroke file-tree re-render; cache reveal signature

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: 提交项目级配置**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs src/renderer/src/lib/api.ts \
  src/shared/ipc.ts src/renderer/src/stores/settingsStore.ts \
  src/renderer/src/components/SettingsPanel.tsx src/renderer/src/hooks/useProjectConfig.ts \
  test/projectConfig.test.ts test/useProjectConfig.test.tsx
git commit -m "feat: per-vault project config in .margin/config.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git status --short
```
Expected: 工作区干净（除本计划/规格文档外无未跟踪文件）。

---

## Task 2: 事务驱动的 `/` 触发检测（纯函数）

**Files:**
- Modify: `src/renderer/src/editor/slashTrigger.ts`
- Test: `test/slashTrigger.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/slashTrigger.test.ts` 追加：

```ts
import { EditorState } from '@codemirror/state'
import { slashInsertedAt } from '@/editor/slashTrigger'

function tr(doc: string, at: number, insert: string, userEvent?: string) {
  const state = EditorState.create({ doc, selection: { anchor: at } })
  return state.update({
    changes: { from: at, insert },
    ...(userEvent ? { userEvent } : {})
  })
}

describe('slashInsertedAt', () => {
  it('detects "/" typed at line start (returns pos after the slash)', () => {
    expect(slashInsertedAt(tr('', 0, '/', 'input.type'))).toBe(1)
  })

  it('detects "/" inserted by IME composition (input.type.compose)', () => {
    expect(slashInsertedAt(tr('你好 ', 3, '/', 'input.type.compose'))).toBe(4)
  })

  it('detects "/" after whitespace mid-line', () => {
    expect(slashInsertedAt(tr('- ', 2, '/', 'input.type'))).toBe(3)
  })

  it('ignores "/" after a non-space char (http://)', () => {
    expect(slashInsertedAt(tr('http:/', 6, '/', 'input.type'))).toBeNull()
  })

  it('ignores pasted "/"', () => {
    expect(slashInsertedAt(tr('', 0, '/', 'input.paste'))).toBeNull()
  })

  it('ignores multi-char insertions and non-user transactions', () => {
    expect(slashInsertedAt(tr('', 0, 'a/', 'input.type'))).toBeNull()
    expect(slashInsertedAt(tr('', 0, '/'))).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/slashTrigger.test.ts`
Expected: FAIL — `slashInsertedAt` is not exported。

- [ ] **Step 3: 实现**

在 `src/renderer/src/editor/slashTrigger.ts` 追加：

```ts
import type { Transaction } from '@codemirror/state'

/**
 * If `tr` is a user typing transaction that inserted a single "/" where the
 * slash menu should open, return the caret position right AFTER the slash;
 * otherwise null.
 *
 * Detecting the actual insertion (instead of intercepting the "/" keydown)
 * makes the trigger reliable under IME composition — during composition key
 * events arrive as keyCode 229 and keymaps never fire, but the final commit
 * still produces an `input.type.compose` transaction we can see here.
 */
export function slashInsertedAt(tr: Transaction): number | null {
  if (!tr.docChanged || !tr.isUserEvent('input.type')) return null
  let slashPos = -1
  tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    if (inserted.length === 1 && inserted.sliceString(0, 1) === '/') slashPos = toB - 1
  })
  if (slashPos < 0) return null
  const line = tr.newDoc.lineAt(slashPos)
  const charBefore = slashPos > line.from ? tr.newDoc.sliceString(slashPos - 1, slashPos) : ''
  return slashMenuTriggers(charBefore) ? slashPos + 1 : null
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/slashTrigger.test.ts`
Expected: PASS（含原有 4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/editor/slashTrigger.ts test/slashTrigger.test.ts
git commit -m "feat(editor): transaction-based slash trigger detection (IME-safe)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Editor 接线 — 替换 keymap 为事务检测

**Files:**
- Modify: `src/renderer/src/components/Editor.tsx`
- Test: `test/slashMenu-dom.test.tsx`

- [ ] **Step 1: 改写 DOM 测试为事务驱动（先失败）**

用以下内容**整体替换** `test/slashMenu-dom.test.tsx` 的 `describe` 块（文件头部 imports/scrollIntoView 垫片保留，新增 `slashInsertedAt` 无需引入）：

```tsx
function mountedView(container: HTMLElement): EditorView {
  const content = container.querySelector('.cm-content') as HTMLElement
  expect(content).toBeTruthy()
  const view = EditorView.findFromDOM(content)
  expect(view).toBeTruthy()
  return view as EditorView
}

describe('slash menu', () => {
  it('opens when "/" is typed at the start of an empty line', async () => {
    const spy = vi
      .spyOn(EditorView.prototype, 'coordsAtPos')
      .mockReturnValue({ left: 10, right: 12, top: 20, bottom: 36 })
    const { container } = render(
      <Editor docKey="x" initialValue="" onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({ changes: { from: 0, insert: '/' }, userEvent: 'input.type' })
    await waitFor(() => {
      expect(document.querySelector('.slash-menu')).not.toBeNull()
    })
    spy.mockRestore()
  })

  it('opens for an IME-composed "/" (input.type.compose)', async () => {
    const spy = vi
      .spyOn(EditorView.prototype, 'coordsAtPos')
      .mockReturnValue({ left: 10, right: 12, top: 20, bottom: 36 })
    const { container } = render(
      <Editor docKey="x" initialValue="你好 " onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({
      changes: { from: 3, insert: '/' },
      selection: { anchor: 4 },
      userEvent: 'input.type.compose'
    })
    await waitFor(() => {
      expect(document.querySelector('.slash-menu')).not.toBeNull()
    })
    spy.mockRestore()
  })

  it('does not open for the second slash of "http://"', async () => {
    const { container } = render(
      <Editor docKey="x" initialValue="http:/" onChange={() => {}} onSave={() => {}} />
    )
    const view = mountedView(container)
    view.dispatch({
      changes: { from: 6, insert: '/' },
      selection: { anchor: 7 },
      userEvent: 'input.type'
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelector('.slash-menu')).toBeNull()
  })
})
```

旧的 `fireEvent.keyDown` 用例删除（fireEvent import 不再用到也一并删）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/slashMenu-dom.test.tsx`
Expected: FAIL — keymap 方案不响应 dispatch 的事务，菜单不出现。

- [ ] **Step 3: 改 Editor.tsx**

(a) import 行改为：

```ts
import { slashMenuTriggers, slashInsertedAt } from '@/editor/slashTrigger'
```
（`slashMenuTriggers` 若不再被引用则只 import `slashInsertedAt`。）

(b) **删除** `const slashKeymap = keymap.of([...])` 整块（约 105–127 行），并从 extensions 数组里删除 `slashKeymap,`。

(c) 在 `handleSlashClose` 后新增打开函数：

```ts
// 在事务确认 "/" 已插入后再测量坐标；测量落空（如尚未布局）下一帧重试一次，
// 不再静默失败。
const openSlashMenuAt = useCallback((view: EditorView, pos: number) => {
  const place = (): boolean => {
    const coords = view.coordsAtPos(pos)
    if (!coords) return false
    setSlashMenu({ x: coords.left, y: coords.bottom + 4, from: pos })
    return true
  }
  view.requestMeasure({
    read: () => null,
    write: () => {
      if (!place()) requestAnimationFrame(() => place())
    }
  })
}, [])
```

(d) updateListener 替换为：

```ts
EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    onChangeRef.current(update.state.doc.toString())
  }
  for (const tr of update.transactions) {
    const pos = slashInsertedAt(tr)
    if (pos != null) openSlashMenuAt(update.view, pos)
  }
}),
```

注意：`useEffect` 依赖数组保持 `[docKey]`，`openSlashMenuAt` 是稳定引用，闭包安全。`handleSlashSelect` 不动 —— `from` 语义（斜杠后一位）与原实现一致。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/slashMenu-dom.test.tsx && npm run typecheck`
Expected: 3 用例 PASS；typecheck 绿。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run
git add src/renderer/src/components/Editor.tsx test/slashMenu-dom.test.tsx
git commit -m "fix(editor): slash menu opens reliably under IME by detecting the inserted character

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Rust 草稿命令（阶段 2a 后端）

**Files:**
- Modify: `src-tauri/src/commands.rs`、`src-tauri/src/main.rs`

- [ ] **Step 1: 写失败测试**

在 `commands.rs` 的 `mod tests` 中追加：

```rust
#[test]
fn draft_round_trip_missing_and_delete() {
    let root = std::env::temp_dir().join("__margin_test_drafts__");
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("sub")).unwrap();
    let root_s = root.to_string_lossy().to_string();
    let note = root.join("sub").join("note.md").to_string_lossy().to_string();

    // Missing draft reads as None; deleting a missing draft is OK.
    assert_eq!(read_draft(root_s.clone(), note.clone()).unwrap(), None);
    assert!(delete_draft(root_s.clone(), note.clone()).is_ok());

    // Write → read back; file lives flat under .margin/drafts with encoded name.
    write_draft(root_s.clone(), note.clone(), "draft body".into()).unwrap();
    assert_eq!(
        read_draft(root_s.clone(), note.clone()).unwrap(),
        Some("draft body".to_string())
    );
    assert!(root.join(".margin").join("drafts").join("sub%2Fnote.md.md").exists());

    // Delete removes it.
    delete_draft(root_s.clone(), note.clone()).unwrap();
    assert_eq!(read_draft(root_s.clone(), note.clone()).unwrap(), None);

    // Path policy still applies.
    assert!(write_draft("".into(), note.clone(), "x".into()).is_err());

    let _ = std::fs::remove_dir_all(&root);
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 编译错误 — `write_draft` 等未定义。

- [ ] **Step 3: 实现命令**

在 `commands.rs` 的 project-config 段后追加：

```rust
// ---------------------------------------------------------------------------
// Crash-recovery drafts (stored flat in `<root>/.margin/drafts/`)
// ---------------------------------------------------------------------------

/// Subdirectory of CONFIG_DIR holding crash-recovery drafts.
const DRAFTS_DIR: &str = "drafts";

/// Flat, reversible draft file name for a note: the vault-relative path with
/// `%` and `/` percent-encoded, plus a trailing `.md`.
fn draft_file_path(root: &str, path: &str) -> std::path::PathBuf {
    let rel = path.strip_prefix(root).unwrap_or(path).trim_start_matches('/');
    let name = rel.replace('%', "%25").replace('/', "%2F");
    Path::new(root)
        .join(CONFIG_DIR)
        .join(DRAFTS_DIR)
        .join(format!("{}.md", name))
}

#[tauri::command]
pub fn write_draft(root: String, path: String, content: String) -> Result<(), String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    let file = draft_file_path(&root, &path);
    let dir = file.parent().ok_or("Invalid draft path")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Could not create drafts dir: {}", e))?;
    std::fs::write(&file, &content).map_err(|e| format!("Could not write draft: {}", e))
}

#[tauri::command]
pub fn read_draft(root: String, path: String) -> Result<Option<String>, String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    match std::fs::read_to_string(draft_file_path(&root, &path)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read draft: {}", e)),
    }
}

#[tauri::command]
pub fn delete_draft(root: String, path: String) -> Result<(), String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    match std::fs::remove_file(draft_file_path(&root, &path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete draft: {}", e)),
    }
}
```

`main.rs` 的 `generate_handler![...]` 末尾追加：

```rust
commands::write_draft,
commands::read_draft,
commands::delete_draft,
```

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat(tauri): draft read/write/delete commands for crash recovery

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: IPC/api 接线 + documentStore 扩展（pendingDraft / epoch）

**Files:**
- Modify: `src/shared/ipc.ts`、`src/renderer/src/lib/api.ts`、`src/renderer/src/stores/documentStore.ts`
- Test: `test/documentStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/documentStore.test.ts` 追加：

```ts
describe('draft restore & epoch', () => {
  it('load clears pendingDraft/conflict and bumps epoch', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    s.setPendingDraft('draft!')
    const epochBefore = useDocumentStore.getState().epoch
    s.load('/v/b.md', 'other')
    expect(useDocumentStore.getState().pendingDraft).toBeNull()
    expect(useDocumentStore.getState().epoch).toBe(epochBefore + 1)
  })

  it('applyDraft makes the draft the dirty content and bumps epoch', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    s.setPendingDraft('draft!')
    const epochBefore = useDocumentStore.getState().epoch
    useDocumentStore.getState().applyDraft()
    const after = useDocumentStore.getState()
    expect(after.content).toBe('draft!')
    expect(after.savedContent).toBe('disk')
    expect(after.saveStatus).toBe('dirty')
    expect(after.pendingDraft).toBeNull()
    expect(after.epoch).toBe(epochBefore + 1)
  })

  it('applyDraft is a no-op without a pending draft', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'disk')
    useDocumentStore.getState().applyDraft()
    expect(useDocumentStore.getState().content).toBe('disk')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/documentStore.test.ts`
Expected: FAIL — `setPendingDraft` 不存在。

- [ ] **Step 3: 扩展 documentStore**

`DocumentState` 接口加字段与动作；实现：

```ts
interface DocumentState {
  // …existing fields…
  /** Remount key for the uncontrolled editor: bumped whenever content is
   *  replaced from outside the editor (open / draft restore / disk reload). */
  epoch: number
  /** Draft found on open, awaiting the user's restore/discard decision. */
  pendingDraft: string | null
  /** Disk content of an external modification awaiting resolution (Task 7). */
  conflict: string | null
  setPendingDraft(draft: string | null): void
  applyDraft(): void
  // …existing methods…
}
```

实现（在 create 内）：

```ts
epoch: 0,
pendingDraft: null,
conflict: null,

load: (path, content) =>
  set((state) => ({
    path, content, savedContent: content, saveStatus: 'saved',
    pendingDraft: null, conflict: null, epoch: state.epoch + 1
  })),

setPendingDraft: (draft) => set({ pendingDraft: draft }),

applyDraft: () =>
  set((s) =>
    s.pendingDraft == null
      ? s
      : {
          content: s.pendingDraft,
          saveStatus: s.pendingDraft === s.savedContent ? 'saved' : 'dirty',
          pendingDraft: null,
          epoch: s.epoch + 1
        }
  ),

reset: () => set({ path: null, content: '', savedContent: '', saveStatus: 'saved', pendingDraft: null, conflict: null })
```

（`conflict` 字段本任务先占位，动作在 Task 7。）

- [ ] **Step 4: IPC + api**

`src/shared/ipc.ts` 的 `MarginApi` 追加：

```ts
/** Crash-recovery drafts stored under `<root>/.margin/drafts/`. */
writeDraft(root: string, path: string, content: string): Promise<void>
readDraft(root: string, path: string): Promise<string | null>
deleteDraft(root: string, path: string): Promise<void>
```

`src/renderer/src/lib/api.ts` 追加实现：

```ts
writeDraft: (root, path, content) => invoke<void>('write_draft', { root, path, content }),
readDraft: (root, path) => invoke<string | null>('read_draft', { root, path }),
deleteDraft: (root, path) => invoke<void>('delete_draft', { root, path }),
```

- [ ] **Step 5: 验证 + 提交**

```bash
npx vitest run test/documentStore.test.ts && npm run typecheck && npx vitest run
git add src/shared/ipc.ts src/renderer/src/lib/api.ts src/renderer/src/stores/documentStore.ts test/documentStore.test.ts
git commit -m "feat(store): draft restore state + editor remount epoch; draft IPC

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

注意：`epoch` 在 `load` 里自增可能影响既有 documentStore 测试的精确断言 — 如有失败按新语义更新断言（仅限 epoch/pendingDraft 相关）。

---

## Task 6: useDraft 钩子 + DraftBanner + App 接线

**Files:**
- Create: `src/renderer/src/hooks/useDraft.ts`、`src/renderer/src/components/DraftBanner.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `test/useDraft.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `test/useDraft.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDraft, DRAFT_INTERVAL_MS } from '@/hooks/useDraft'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    writeDraft: vi.fn(() => Promise.resolve()),
    deleteDraft: vi.fn(() => Promise.resolve())
  }
}))

beforeEach(() => {
  vi.useFakeTimers()
  useVaultStore.getState().openRoot('/vault', [])
  useDocumentStore.getState().load('/vault/a.md', 'disk')
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useDraft', () => {
  it('writes a draft after the interval while dirty, but not when clean', () => {
    const { unmount } = renderHook(() => useDraft())
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).not.toHaveBeenCalled() // clean → no draft

    useDocumentStore.getState().setContent('edited')
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).toHaveBeenCalledWith('/vault', '/vault/a.md', 'edited')

    // unchanged content → no duplicate write
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS + 10)
    expect(api.writeDraft).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('deletes the draft when the document becomes saved', () => {
    const { unmount } = renderHook(() => useDraft())
    useDocumentStore.getState().setContent('edited')
    useDocumentStore.getState().markSaved('edited')
    expect(api.deleteDraft).toHaveBeenCalledWith('/vault', '/vault/a.md')
    unmount()
  })
})
```

> 若 `useVaultStore.openRoot` 的签名不同（看 `src/renderer/src/stores/vaultStore.ts` 确认），按实际 API 设 root。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/useDraft.test.tsx`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 useDraft**

新建 `src/renderer/src/hooks/useDraft.ts`：

```ts
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

export const DRAFT_INTERVAL_MS = 2000

/**
 * Crash-recovery drafts: while the document is dirty, snapshot unsaved content
 * into `<vault>/.margin/drafts/` every couple of seconds; drop the draft once
 * the document is saved. All failures are silent — drafts must never interrupt
 * typing.
 */
export function useDraft(): void {
  useEffect(() => {
    let lastWritten: string | null = null

    const timer = setInterval(() => {
      const root = useVaultStore.getState().root
      const { path, content, savedContent } = useDocumentStore.getState()
      if (!root || !path || content === savedContent || content === lastWritten) return
      lastWritten = content
      void api.writeDraft(root, path, content).catch(() => {})
    }, DRAFT_INTERVAL_MS)

    const unsub = useDocumentStore.subscribe((s, prev) => {
      if (s.path && s.saveStatus === 'saved' && prev.saveStatus !== 'saved') {
        const root = useVaultStore.getState().root
        if (root) void api.deleteDraft(root, s.path).catch(() => {})
      }
    })

    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/useDraft.test.tsx`
Expected: PASS。

- [ ] **Step 5: DraftBanner 组件**

新建 `src/renderer/src/components/DraftBanner.tsx`：

```tsx
import { api } from '@/lib/api'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

/** Banner offering to restore a crash-recovery draft found on file open. */
export function DraftBanner(): JSX.Element | null {
  const pending = useDocumentStore((s) => s.pendingDraft)
  if (pending == null) return null

  const discard = (): void => {
    const { path } = useDocumentStore.getState()
    const root = useVaultStore.getState().root
    useDocumentStore.getState().setPendingDraft(null)
    if (root && path) void api.deleteDraft(root, path).catch(() => {})
  }

  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--border-soft)] bg-[color:var(--accent-soft)] px-4 py-1.5 text-[12.5px]">
      <span className="flex-1 text-[color:var(--text-dim)]">
        检测到未保存的草稿（可能由意外退出产生）
      </span>
      <button
        className="rounded-md px-2 py-0.5 font-medium text-[color:var(--accent)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => useDocumentStore.getState().applyDraft()}
      >
        恢复草稿
      </button>
      <button
        className="rounded-md px-2 py-0.5 text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
        onClick={discard}
      >
        丢弃
      </button>
    </div>
  )
}
```

- [ ] **Step 6: App 接线**

`App.tsx`：

(a) imports 加 `import { useDraft } from '@/hooks/useDraft'`、`import { DraftBanner } from '@/components/DraftBanner'`。

(b) `useProjectConfig()` 之后加一行 `useDraft()`。

(c) 订阅 epoch（与 path 一起，是低频变化）：

```ts
const path = useDocumentStore((s) => s.path)
const epoch = useDocumentStore((s) => s.epoch)
```

(d) `openFileByPath` 改为打开后查草稿：

```ts
const openFileByPath = useCallback(async (filePath: string): Promise<void> => {
  const text = await api.readFile(filePath)
  useDocumentStore.getState().load(filePath, text)
  useVaultStore.getState().select(filePath)
  const root = useVaultStore.getState().root
  if (root) {
    const draft = await api.readDraft(root, filePath).catch(() => null)
    if (draft != null && draft !== text) useDocumentStore.getState().setPendingDraft(draft)
  }
}, [])
```

(e) `<main>` 内 Editor 上方渲染 banner，并把 docKey 换成含 epoch：

```tsx
<main className="min-h-0 min-w-0 flex-1">
  {path ? (
    <div className="flex h-full flex-col">
      <DraftBanner />
      <div className="min-h-0 flex-1">
        <Editor
          ref={editorRef}
          docKey={`${path}:${epoch}`}
          initialValue={useDocumentStore.getState().content}
          onChange={handleChange}
          onSave={() => void save()}
        />
      </div>
    </div>
  ) : (
    /* …原 else 分支不变… */
  )}
</main>
```

> docKey 含 epoch 后，`useVaultWatch` 的「干净时静默重载」也真正生效了（旧实现 load 后编辑器不刷新，是个既有 bug，顺带修复）。

- [ ] **Step 7: 全量验证 + 提交**

```bash
npm run typecheck && npx vitest run
git add src/renderer/src/hooks/useDraft.ts src/renderer/src/components/DraftBanner.tsx src/renderer/src/App.tsx test/useDraft.test.tsx
git commit -m "feat: crash-recovery drafts with restore banner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 冲突检测 — store 动作 + 保存守卫 + ConflictBar

**Files:**
- Modify: `src/renderer/src/stores/documentStore.ts`、`src/renderer/src/lib/saveDocument.ts`、`src/renderer/src/hooks/useVaultWatch.ts`、`src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/ConflictBar.tsx`
- Test: `test/documentStore.test.ts`、`test/saveDocument.test.ts`

- [ ] **Step 1: 写失败测试（store 动作）**

`test/documentStore.test.ts` 追加：

```ts
describe('external-change conflict', () => {
  it('keepMine adopts disk as savedContent and stays dirty', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'base')
    s.setContent('mine')
    s.setConflict('theirs')
    useDocumentStore.getState().keepMine()
    const after = useDocumentStore.getState()
    expect(after.conflict).toBeNull()
    expect(after.savedContent).toBe('theirs')
    expect(after.saveStatus).toBe('dirty')
    expect(after.content).toBe('mine')
  })

  it('takeDisk replaces content, marks saved, bumps epoch', () => {
    const s = useDocumentStore.getState()
    s.load('/v/a.md', 'base')
    s.setContent('mine')
    s.setConflict('theirs')
    const epochBefore = useDocumentStore.getState().epoch
    useDocumentStore.getState().takeDisk()
    const after = useDocumentStore.getState()
    expect(after.content).toBe('theirs')
    expect(after.savedContent).toBe('theirs')
    expect(after.saveStatus).toBe('saved')
    expect(after.conflict).toBeNull()
    expect(after.epoch).toBe(epochBefore + 1)
  })
})
```

- [ ] **Step 2: 写失败测试（保存守卫）**

查看 `test/saveDocument.test.ts` 现有 mock 风格后追加（按现有风格适配 writeFile mock）：

```ts
it('blocks the save and raises a conflict when disk changed externally', async () => {
  useDocumentStore.getState().load('/v/a.md', 'base')
  useDocumentStore.getState().setContent('mine')
  const writeFile = vi.fn(() => Promise.resolve())
  const readFile = vi.fn(() => Promise.resolve('external change'))
  await saveDocument(writeFile, readFile)
  expect(writeFile).not.toHaveBeenCalled()
  expect(useDocumentStore.getState().conflict).toBe('external change')
})

it('saves normally when disk matches what we last saw', async () => {
  useDocumentStore.getState().load('/v/a.md', 'base')
  useDocumentStore.getState().setContent('mine')
  const writeFile = vi.fn(() => Promise.resolve())
  const readFile = vi.fn(() => Promise.resolve('base'))
  await saveDocument(writeFile, readFile)
  expect(writeFile).toHaveBeenCalledWith('/v/a.md', 'mine')
  expect(useDocumentStore.getState().saveStatus).toBe('saved')
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run test/documentStore.test.ts test/saveDocument.test.ts`
Expected: FAIL — `setConflict` 等不存在 / saveDocument 不接受第二参。

- [ ] **Step 4: 实现 store 动作**

`documentStore.ts` 接口追加：

```ts
setConflict(disk: string): void
keepMine(): void
takeDisk(): void
```

实现：

```ts
setConflict: (disk) => set({ conflict: disk }),

// 保留本地编辑：把磁盘版本记为"已知的磁盘内容"，文档保持 dirty，
// 下一次保存按用户意愿覆盖磁盘。
keepMine: () =>
  set((s) =>
    s.conflict == null
      ? s
      : {
          savedContent: s.conflict,
          saveStatus: s.content === s.conflict ? 'saved' : 'dirty',
          conflict: null
        }
  ),

// 采用磁盘版本：替换内容并 remount 编辑器。
takeDisk: () =>
  set((s) =>
    s.conflict == null
      ? s
      : {
          content: s.conflict,
          savedContent: s.conflict,
          saveStatus: 'saved',
          conflict: null,
          epoch: s.epoch + 1
        }
  ),
```

- [ ] **Step 5: saveDocument 加守卫**

`saveDocument.ts` 整体替换为：

```ts
import { useDocumentStore } from '@/stores/documentStore'

type WriteFile = (path: string, content: string) => Promise<void>
type ReadFile = (path: string) => Promise<string>

let saving = false

/**
 * Persist the current document to disk. Single write in flight; re-saves until
 * converged. When `readFile` is provided, the disk is checked before each
 * write — if it no longer matches the content we last loaded/saved, the write
 * is withheld and a conflict is raised instead (never silently overwrite an
 * external change). A pending conflict also pauses autosave entirely.
 */
export async function saveDocument(writeFile: WriteFile, readFile?: ReadFile): Promise<void> {
  const store = useDocumentStore
  if (saving) return
  if (!store.getState().path || !store.getState().isDirty()) return
  if (store.getState().conflict != null) return

  saving = true
  try {
    while (store.getState().isDirty() && store.getState().conflict == null) {
      const { path, content, savedContent } = store.getState()
      if (!path) break
      if (readFile) {
        const disk = await readFile(path).catch(() => null)
        if (disk != null && disk !== savedContent && disk !== content) {
          store.getState().setConflict(disk)
          break
        }
      }
      store.getState().markSaving()
      await writeFile(path, content)
      store.getState().markSaved(content)
    }
  } catch (err) {
    console.error('Failed to save document:', err)
    store.getState().markError()
  } finally {
    saving = false
  }
}
```

`App.tsx` 的 `save()` 改为：

```ts
function save(): Promise<void> {
  return saveDocument(api.writeFile, api.readFile)
}
```

- [ ] **Step 6: useVaultWatch 用冲突条替代 window.confirm**

`useVaultWatch.ts` 中 dirty 分支替换：

```ts
if (!doc.isDirty()) {
  doc.load(openPath, disk) // clean → silently adopt disk (editor remounts via epoch)
} else {
  doc.setConflict(disk) // dirty → non-blocking conflict bar decides
}
```

（删除 `window.confirm` 块。）

- [ ] **Step 7: ConflictBar 组件 + App 渲染**

新建 `src/renderer/src/components/ConflictBar.tsx`：

```tsx
import { useDocumentStore } from '@/stores/documentStore'

/** Non-blocking banner shown when the open file was modified outside Margin. */
export function ConflictBar(): JSX.Element | null {
  const conflict = useDocumentStore((s) => s.conflict)
  if (conflict == null) return null
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--border-soft)] bg-[color:var(--bg-hover)] px-4 py-1.5 text-[12.5px]">
      <span className="flex-1 text-[color:var(--text-dim)]">
        文件已在 Margin 之外被修改
      </span>
      <button
        className="rounded-md px-2 py-0.5 font-medium text-[color:var(--accent)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => useDocumentStore.getState().keepMine()}
      >
        保留我的（下次保存覆盖）
      </button>
      <button
        className="rounded-md px-2 py-0.5 text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
        onClick={() => useDocumentStore.getState().takeDisk()}
      >
        载入磁盘版本
      </button>
    </div>
  )
}
```

App 中 `<DraftBanner />` 旁加 `<ConflictBar />`（同列布局内、Editor 上方）。

- [ ] **Step 8: 全量验证 + 提交**

```bash
npm run typecheck && npx vitest run
git add src/renderer/src/stores/documentStore.ts src/renderer/src/lib/saveDocument.ts \
  src/renderer/src/hooks/useVaultWatch.ts src/renderer/src/components/ConflictBar.tsx \
  src/renderer/src/App.tsx test/documentStore.test.ts test/saveDocument.test.ts
git commit -m "feat: external-change conflict detection with non-blocking resolution bar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: 路径解析工具（图片与链接共用）

**Files:**
- Create: `src/renderer/src/lib/resolvePath.ts`
- Test: `test/resolvePath.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/resolvePath.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { isExternal, resolveRelative } from '@/lib/resolvePath'

describe('isExternal', () => {
  it('recognizes http/https/data/asset/mailto', () => {
    expect(isExternal('https://a.com/x.png')).toBe(true)
    expect(isExternal('http://a.com')).toBe(true)
    expect(isExternal('data:image/png;base64,xx')).toBe(true)
    expect(isExternal('mailto:a@b.c')).toBe(true)
    expect(isExternal('./img/a.png')).toBe(false)
    expect(isExternal('/abs/a.png')).toBe(false)
  })
})

describe('resolveRelative', () => {
  it('resolves relative to the document directory', () => {
    expect(resolveRelative('img/a.png', '/vault/notes/n.md')).toBe('/vault/notes/img/a.png')
  })
  it('normalizes ./ and ../ segments', () => {
    expect(resolveRelative('../img/a.png', '/vault/notes/n.md')).toBe('/vault/img/a.png')
    expect(resolveRelative('./a.png', '/vault/n.md')).toBe('/vault/a.png')
  })
  it('keeps absolute paths, decodes percent-encoding', () => {
    expect(resolveRelative('/abs/a.png', '/vault/n.md')).toBe('/abs/a.png')
    expect(resolveRelative('img/a%20b.png', '/vault/n.md')).toBe('/vault/img/a b.png')
  })
  it('returns null without a document path', () => {
    expect(resolveRelative('a.png', null)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/resolvePath.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 实现**

新建 `src/renderer/src/lib/resolvePath.ts`：

```ts
/** True for URLs that load directly (not vault-relative paths). */
export function isExternal(url: string): boolean {
  return /^(https?:|data:|asset:|mailto:)/i.test(url)
}

/**
 * Resolve a markdown-relative target (image src / link href) against the
 * directory of the containing document. Returns an absolute filesystem path,
 * or null when there is no document path to resolve against.
 */
export function resolveRelative(target: string, docPath: string | null): string | null {
  if (!docPath) return null
  let t = target
  try {
    t = decodeURIComponent(target)
  } catch {
    /* keep raw on malformed escapes */
  }
  if (t.startsWith('/')) return normalize(t)
  const baseDir = docPath.includes('/') ? docPath.replace(/\/[^/]*$/, '') : ''
  return normalize(baseDir + '/' + t)
}

function normalize(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}
```

- [ ] **Step 4: 通过 + 提交**

```bash
npx vitest run test/resolvePath.test.ts && npm run typecheck
git add src/renderer/src/lib/resolvePath.ts test/resolvePath.test.ts
git commit -m "feat: vault-relative path resolver for images and links

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: 图片内联渲染（阶段 3）

**Files:**
- Modify: `src-tauri/tauri.conf.json`、`src/renderer/src/editor/livePreview/decorationSpecs.ts`、`src/renderer/src/editor/livePreview/widgets.ts`、`src/renderer/src/editor/livePreview/livePreviewPlugin.ts`、`src/renderer/src/editor/livePreview/theme.ts`、`src/renderer/src/components/Editor.tsx`、`src/renderer/src/App.tsx`
- Create: `src/renderer/src/editor/docPathFacet.ts`
- Test: `test/decorationSpecs-image.test.ts`

- [ ] **Step 1: 开启 asset 协议**

`tauri.conf.json` 的 `app.security` 改为：

```json
"security": {
  "csp": null,
  "assetProtocol": { "enable": true, "scope": ["**"] }
}
```

（本地笔记应用信任本机文件，与 Obsidian 同模型。）

- [ ] **Step 2: 写失败测试（装饰收集）**

新建 `test/decorationSpecs-image.test.ts`（参考既有 `decorationSpecs-*.test.ts` 的 state 构造方式，通常是 `EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })`）：

```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { collectDecorations } from '@/editor/livePreview/decorationSpecs'

function state(doc: string, anchor = 0) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage })]
  })
}

describe('image decorations', () => {
  it('emits an image spec with url + alt when cursor is elsewhere', () => {
    const s = state('text\n\n![my alt](img/pic.png)\n\nmore', 0)
    const img = collectDecorations(s).find((d) => d.kind === 'image')
    expect(img).toBeTruthy()
    expect(img?.source).toBe('img/pic.png')
    expect(img?.info).toBe('my alt')
  })

  it('does not emit an image spec when the cursor is on the image line', () => {
    const doc = '![a](p.png)'
    const s = state(doc, 3)
    expect(collectDecorations(s).find((d) => d.kind === 'image')).toBeUndefined()
  })
})
```

Run: `npx vitest run test/decorationSpecs-image.test.ts` → FAIL。

- [ ] **Step 3: decorationSpecs 加 Image 处理**

`DecoKind` 联合类型追加 `'image'`。在 `Link` 处理块**之前**加：

```ts
// Inline image: replace `![alt](src)` with a rendered <img> when the cursor
// is outside the node's line; reveal raw source when inside.
if (name === 'Image') {
  const revealed = rangeRevealed(state, node.from, node.to)
  if (revealed) return // raw text shows; let children render unstyled
  const urlNode = node.node.getChild('URL')
  const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
  const alt = /^!\[([^\]]*)\]/.exec(doc.sliceString(node.from, node.to))?.[1] ?? ''
  specs.push({ kind: 'image', from: node.from, to: node.to, revealed: false, source: url, info: alt })
  return false // widget replaces the range — skip children
}
```

Run: `npx vitest run test/decorationSpecs-image.test.ts` → PASS。

- [ ] **Step 4: docPath Facet + Editor/App 传递**

新建 `src/renderer/src/editor/docPathFacet.ts`：

```ts
import { Facet } from '@codemirror/state'

/** Absolute path of the open document; used to resolve relative image/link targets. */
export const docPathFacet = Facet.define<string | null, string | null>({
  combine: (values) => (values.length ? values[0] : null)
})
```

`Editor.tsx`：props 加 `filePath?: string | null`（解构默认 `null`），extensions 数组（`livePreview` 之前）加 `docPathFacet.of(filePath)`，effect 依赖保持 `[docKey]`（path 变则 docKey 变，重建时取到新值）。App 的 `<Editor>` 加 `filePath={path}`。

- [ ] **Step 5: ImageWidget**

`widgets.ts` 顶部加 import：

```ts
import { convertFileSrc } from '@tauri-apps/api/core'
```

文件末尾追加：

```ts
/** Natural-size cache so decoration rebuilds don't cause layout jumps. */
const imageDims = new Map<string, { w: number; h: number }>()

function toDisplayUrl(p: string): string {
  if (/^(https?:|data:|asset:)/i.test(p)) return p
  try {
    return convertFileSrc(p)
  } catch {
    return 'file://' + p // non-Tauri contexts (tests, demo harness)
  }
}

/** Renders `![alt](src)` as an inline image with graceful error fallback. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    /** Absolute path or external URL; null when unresolvable (no doc path). */
    readonly resolved: string | null
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.resolved === this.resolved
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    if (!this.resolved) return this.renderError(wrap)

    const url = toDisplayUrl(this.resolved)
    const img = document.createElement('img')
    img.alt = this.alt
    const dims = imageDims.get(url)
    if (dims) img.style.aspectRatio = `${dims.w} / ${dims.h}`
    img.addEventListener('load', () => {
      if (!imageDims.has(url)) {
        imageDims.set(url, { w: img.naturalWidth, h: img.naturalHeight })
        view.requestMeasure()
      }
    })
    img.addEventListener('error', () => {
      wrap.textContent = ''
      this.renderError(wrap)
      view.requestMeasure()
    })
    img.src = url
    wrap.appendChild(img)
    return wrap
  }

  private renderError(wrap: HTMLElement): HTMLElement {
    const ph = document.createElement('span')
    ph.className = 'cm-image-error'
    ph.textContent = `图片加载失败: ${this.alt || ''} (${this.src})`
    wrap.appendChild(ph)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

- [ ] **Step 6: livePreviewPlugin 接 image case**

imports 加 `ImageWidget`、`docPathFacet`（`@/editor/docPathFacet`）、`isExternal, resolveRelative`（`@/lib/resolvePath`）。switch 加：

```ts
case 'image': {
  const src = s.source ?? ''
  const dp = state.facet(docPathFacet)
  const resolved = isExternal(src) ? src : resolveRelative(src, dp)
  ranges.push(
    Decoration.replace({ widget: new ImageWidget(src, s.info ?? '', resolved) }).range(s.from, s.to)
  )
  break
}
```

注意 `buildDecorations(state)` 已有 `state` 形参可用。

- [ ] **Step 7: 样式**

`theme.ts` 在既有 widget 样式（如 `.cm-table-render`）旁追加：

```ts
'.cm-image-wrap': { display: 'inline-block', maxWidth: '100%' },
'.cm-image-wrap img': {
  maxWidth: '100%',
  borderRadius: '6px',
  display: 'block',
  margin: '4px auto'
},
'.cm-image-error': {
  color: 'var(--text-faint)',
  fontSize: '13px',
  fontStyle: 'italic'
},
```

- [ ] **Step 8: 全量验证 + 提交**

```bash
npm run typecheck && npx vitest run
git add src-tauri/tauri.conf.json src/renderer/src/editor/docPathFacet.ts \
  src/renderer/src/editor/livePreview/ src/renderer/src/components/Editor.tsx \
  src/renderer/src/App.tsx test/decorationSpecs-image.test.ts src/renderer/src/lib/resolvePath.ts
git commit -m "feat(editor): inline image rendering with cursor reveal (Typora-style)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: 任务勾选可点击（阶段 4）

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`、`src/renderer/src/editor/livePreview/livePreviewPlugin.ts`
- Test: `test/checkboxToggle-dom.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/checkboxToggle-dom.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'

function mount(doc: string, anchor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview]
  })
  const view = new EditorView({ state, parent: document.body })
  return view
}

describe('task checkbox toggle', () => {
  it('clicking an unchecked box checks it in the document', () => {
    const doc = '- [ ] task\n\nelsewhere'
    const view = mount(doc, doc.length) // cursor away → widget renders
    const box = view.dom.querySelector('.cm-task-checkbox') as HTMLInputElement
    expect(box).toBeTruthy()
    expect(box.disabled).toBe(false)
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.state.doc.toString()).toContain('- [x] task')
    view.destroy()
  })

  it('clicking a checked box unchecks it', () => {
    const doc = '- [x] done\n\nelsewhere'
    const view = mount(doc, doc.length)
    const box = view.dom.querySelector('.cm-task-checkbox') as HTMLInputElement
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.state.doc.toString()).toContain('- [ ] done')
    view.destroy()
  })
})
```

Run: `npx vitest run test/checkboxToggle-dom.test.ts` → FAIL（box.disabled 为 true / 点击无效果）。

- [ ] **Step 2: CheckboxWidget 改为可交互**

`widgets.ts` 中 `CheckboxWidget` 整体替换：

```ts
/** Clickable task-list checkbox replacing the raw `[ ]` / `[x]` token. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task-checkbox'
    box.addEventListener('mousedown', (e) => {
      e.preventDefault() // keep editor selection where it is
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return box
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

`livePreviewPlugin.ts` 的 task case 改传位置：

```ts
case 'task':
  if (!s.revealed) {
    ranges.push(
      Decoration.replace({
        widget: new CheckboxWidget(s.checked ?? false, s.from, s.to)
      }).range(s.from, s.to)
    )
  }
  break
```

- [ ] **Step 3: 通过 + 全量 + 提交**

```bash
npx vitest run test/checkboxToggle-dom.test.ts && npx vitest run && npm run typecheck
git add src/renderer/src/editor/livePreview/widgets.ts src/renderer/src/editor/livePreview/livePreviewPlugin.ts test/checkboxToggle-dom.test.ts
git commit -m "feat(editor): clickable task checkboxes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: 表格 Tab 导航 + 末格加行 + 悬浮工具条

**Files:**
- Modify: `src/renderer/src/editor/livePreview/widgets.ts`、`src/renderer/src/editor/livePreview/theme.ts`
- Test: `test/tableInteraction-dom.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/tableInteraction-dom.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from '@/editor/livePreview/livePreviewPlugin'

const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\ncursor parking'

function mount(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), livePreview]
  })
  return new EditorView({ state, parent: document.body })
}

function cells(view: EditorView): HTMLTableCellElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-table-render th, .cm-table-render td'))
}

describe('table interaction', () => {
  it('Tab moves focus to the next cell', () => {
    const view = mount(TABLE)
    const all = cells(view)
    expect(all.length).toBe(4)
    all[0].focus()
    all[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(all[1])
    view.destroy()
  })

  it('Tab on the last cell appends an empty row', () => {
    const view = mount(TABLE)
    const all = cells(view)
    const last = all[all.length - 1]
    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(view.state.doc.toString()).toContain('| 1 | 2 |\n|  |  |')
    view.destroy()
  })

  it('toolbar adds a column after the focused one', () => {
    const view = mount(TABLE)
    cells(view)[0].focus()
    const addCol = Array.from(view.dom.querySelectorAll('.cm-table-toolbar button')).find(
      (b) => b.textContent === '+列'
    ) as HTMLButtonElement
    expect(addCol).toBeTruthy()
    addCol.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.state.doc.toString()).toContain('| a |  | b |')
    view.destroy()
  })
})
```

Run: `npx vitest run test/tableInteraction-dom.test.ts` → FAIL。

- [ ] **Step 2: TableWidget 重写**

`widgets.ts`：在 `ALIGN_CSS` 前加模块级焦点请求；imports 补 `type TableModel`：

```ts
import { parseTable, serializeTable, type Align, type TableModel } from './tableModel'

/** One-shot focus request honored by the next TableWidget toDOM (used to
 *  restore focus across the widget rebuild that follows a table edit). */
let pendingTableFocus: { row: number; col: number } | null = null
function requestTableFocus(row: number, col: number): void {
  pendingTableFocus = { row, col }
  // Drop the request if no rebuild consumes it (focus moved without an edit).
  setTimeout(() => {
    pendingTableFocus = null
  }, 80)
}
```

`TableWidget` 的 `toDOM` 整体替换为：

```ts
toDOM(view: EditorView): HTMLElement {
  const model = parseTable(this.source)
  const cols = model.header.length
  const wrap = document.createElement('div')
  wrap.className = 'cm-table-wrap'
  const table = document.createElement('table')
  table.className = 'cm-table-render'

  let composing = false
  const cellGrid: HTMLTableCellElement[][] = [] // row 0 = header
  let focusedRow = 0
  let focusedCol = 0

  const readModel = (): TableModel => ({
    header: (cellGrid[0] ?? []).map((c) => c.textContent ?? ''),
    align: [...model.align],
    rows: cellGrid.slice(1).map((r) => r.map((c) => c.textContent ?? ''))
  })

  const dispatchModel = (next: TableModel): void => {
    const insert = serializeTable(next)
    if (insert === this.source) return
    view.dispatch({ changes: { from: this.from, to: this.to, insert } })
  }

  const commit = (): void => dispatchModel(readModel())

  const focusCell = (r: number, c: number): void => {
    cellGrid[r]?.[c]?.focus()
  }

  const wireCell = (td: HTMLTableCellElement, row: number, col: number, align: Align): void => {
    td.contentEditable = 'true'
    td.spellcheck = false
    if (align) td.style.textAlign = ALIGN_CSS[align]
    td.addEventListener('focus', () => {
      focusedRow = row
      focusedCol = col
    })
    td.addEventListener('compositionstart', () => {
      composing = true
    })
    td.addEventListener('compositionend', () => {
      composing = false
      commit()
    })
    td.addEventListener('blur', () => {
      if (!composing) commit()
    })
    td.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return
      e.preventDefault()
      const lastRow = cellGrid.length - 1
      if (!e.shiftKey && row === lastRow && col === cols - 1) {
        // Typora behavior: Tab on the last cell appends an empty row.
        const next = readModel()
        next.rows.push(Array.from({ length: cols }, () => ''))
        requestTableFocus(lastRow + 1, 0)
        dispatchModel(next)
        return
      }
      const flat = row * cols + col + (e.shiftKey ? -1 : 1)
      if (flat < 0 || flat >= cellGrid.length * cols) return
      const nr = Math.floor(flat / cols)
      const nc = flat % cols
      // Focus shift blurs this cell; if its text changed, the blur-commit
      // rebuilds the widget and the pending request restores focus there.
      requestTableFocus(nr, nc)
      focusCell(nr, nc)
    })
  }

  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  const headerCells: HTMLTableCellElement[] = []
  model.header.forEach((cell, i) => {
    const th = document.createElement('th')
    th.textContent = cell
    wireCell(th, 0, i, model.align[i] ?? null)
    headerCells.push(th)
    htr.appendChild(th)
  })
  cellGrid.push(headerCells)
  thead.appendChild(htr)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  model.rows.forEach((rowVals, r) => {
    const tr = document.createElement('tr')
    const rowCells: HTMLTableCellElement[] = []
    model.header.forEach((_, i) => {
      const td = document.createElement('td')
      td.textContent = rowVals[i] ?? ''
      wireCell(td, r + 1, i, model.align[i] ?? null)
      rowCells.push(td)
      tr.appendChild(td)
    })
    cellGrid.push(rowCells)
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)

  // Hover toolbar: row/column ops relative to the last focused cell.
  const bar = document.createElement('div')
  bar.className = 'cm-table-toolbar'
  const bodyIdx = (): number => Math.max(0, focusedRow - 1)
  const op = (label: string, title: string, run: (m: TableModel) => void): void => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.addEventListener('mousedown', (e) => {
      e.preventDefault() // keep cell focus; read the DOM before mutating
      const next = readModel()
      run(next)
      requestTableFocus(
        Math.min(focusedRow, next.rows.length),
        Math.min(focusedCol, next.header.length - 1)
      )
      dispatchModel(next)
    })
    bar.appendChild(b)
  }
  op('+行', '在下方插入行', (m) =>
    m.rows.splice(bodyIdx() + 1, 0, Array.from({ length: m.header.length }, () => ''))
  )
  op('−行', '删除当前行', (m) => {
    if (m.rows.length > 1 && focusedRow > 0) m.rows.splice(bodyIdx(), 1)
  })
  op('+列', '在右侧插入列', (m) => {
    m.header.splice(focusedCol + 1, 0, '')
    m.align.splice(focusedCol + 1, 0, null)
    m.rows.forEach((r) => r.splice(focusedCol + 1, 0, ''))
  })
  op('−列', '删除当前列', (m) => {
    if (m.header.length <= 1) return
    m.header.splice(focusedCol, 1)
    m.align.splice(focusedCol, 1)
    m.rows.forEach((r) => r.splice(focusedCol, 1))
  })

  wrap.appendChild(bar)
  wrap.appendChild(table)

  if (pendingTableFocus) {
    const { row, col } = pendingTableFocus
    pendingTableFocus = null
    queueMicrotask(() => focusCell(row, col))
  }
  return wrap
}
```

- [ ] **Step 3: 工具条样式**

`theme.ts` 追加：

```ts
'.cm-table-wrap': { position: 'relative' },
'.cm-table-toolbar': {
  position: 'absolute',
  top: '-28px',
  right: '0',
  display: 'none',
  gap: '4px',
  zIndex: '10'
},
'.cm-table-wrap:hover .cm-table-toolbar': { display: 'flex' },
'.cm-table-toolbar button': {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-soft)',
  background: 'var(--bg-elev)',
  color: 'var(--text-dim)',
  cursor: 'pointer'
},
'.cm-table-toolbar button:hover': { color: 'var(--accent)' },
```

> 若 `.cm-table-wrap` 在 theme.ts 已有条目，合并 `position: 'relative'` 进既有对象，勿重复键。

- [ ] **Step 4: 通过 + 全量 + 提交**

```bash
npx vitest run test/tableInteraction-dom.test.ts && npx vitest run && npm run typecheck
git add src/renderer/src/editor/livePreview/widgets.ts src/renderer/src/editor/livePreview/theme.ts test/tableInteraction-dom.test.ts
git commit -m "feat(editor): table Tab navigation, append-row, and hover toolbar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: 链接 Cmd+点击跳转

**Files:**
- Create: `src/renderer/src/editor/livePreview/linkAt.ts`
- Modify: `src/renderer/src/components/Editor.tsx`、`src/renderer/src/App.tsx`
- Test: `test/linkAt.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/linkAt.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { linkUrlAt } from '@/editor/livePreview/linkAt'

function state(doc: string) {
  const s = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  ensureSyntaxTree(s, doc.length, 5000)
  return s
}

describe('linkUrlAt', () => {
  it('returns the URL when pos is inside a link', () => {
    const s = state('see [docs](https://example.com) here')
    expect(linkUrlAt(s, 6)).toBe('https://example.com')
  })
  it('returns the target of a relative md link', () => {
    const s = state('see [note](../notes/other.md)')
    expect(linkUrlAt(s, 6)).toBe('../notes/other.md')
  })
  it('returns null outside links', () => {
    const s = state('plain text')
    expect(linkUrlAt(s, 2)).toBeNull()
  })
})
```

Run: `npx vitest run test/linkAt.test.ts` → FAIL。

- [ ] **Step 2: 实现 linkUrlAt**

新建 `src/renderer/src/editor/livePreview/linkAt.ts`：

```ts
import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'

/** URL of the markdown Link node containing `pos`, or null. */
export function linkUrlAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 0)
  while (node && node.name !== 'Link') node = node.parent
  if (!node) return null
  const url = node.getChild('URL')
  return url ? state.doc.sliceString(url.from, url.to) : null
}
```

Run: `npx vitest run test/linkAt.test.ts` → PASS。

- [ ] **Step 3: Editor 加 Cmd+点击处理**

`Editor.tsx`：

(a) props 加 `onOpenLink?: (url: string) => void`；与 onChange 一样用 ref 保持稳定：

```ts
const onOpenLinkRef = useRef(onOpenLink)
onOpenLinkRef.current = onOpenLink
```

(b) imports 加 `import { linkUrlAt } from '@/editor/livePreview/linkAt'`。

(c) extensions 数组追加：

```ts
EditorView.domEventHandlers({
  mousedown: (e, view) => {
    if (!(e.metaKey || e.ctrlKey)) return false
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) return false
    const url = linkUrlAt(view.state, pos)
    if (!url) return false
    e.preventDefault()
    onOpenLinkRef.current?.(url)
    return true
  }
}),
```

- [ ] **Step 4: App 处理跳转**

`App.tsx`：

(a) imports 加 `import { open as shellOpen } from '@tauri-apps/plugin-shell'`、`import { isExternal, resolveRelative } from '@/lib/resolvePath'`。

(b) 加 handler（放在 `openFileByPath` 之后）：

```ts
const handleOpenLink = useCallback(
  (url: string): void => {
    if (isExternal(url)) {
      void shellOpen(url).catch(() => {})
      return
    }
    const docPath = useDocumentStore.getState().path
    const target = resolveRelative(url, docPath)
    if (target && target.endsWith('.md')) {
      void openFileByPath(target).catch(() => {
        window.alert(`无法打开链接目标: ${url}`)
      })
    }
  },
  [openFileByPath]
)
```

(c) `<Editor>` 加 `onOpenLink={handleOpenLink}`。

- [ ] **Step 5: 全量 + 提交**

```bash
npm run typecheck && npx vitest run
git add src/renderer/src/editor/livePreview/linkAt.ts src/renderer/src/components/Editor.tsx src/renderer/src/App.tsx test/linkAt.test.ts
git commit -m "feat(editor): cmd-click opens external links and vault-relative notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 13: 脚注引用徽标 + 悬浮预览

**Files:**
- Create: `src/renderer/src/editor/livePreview/footnotes.ts`
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`、`src/renderer/src/editor/livePreview/widgets.ts`、`src/renderer/src/editor/livePreview/livePreviewPlugin.ts`、`src/renderer/src/editor/livePreview/theme.ts`
- Test: `test/footnotes.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/footnotes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { collectFootnoteRefs, findFootnoteDef } from '@/editor/livePreview/footnotes'

describe('collectFootnoteRefs', () => {
  it('finds refs but not definitions', () => {
    const text = 'claim[^1] and more[^note]\n\n[^1]: first def\n[^note]: second'
    const refs = collectFootnoteRefs(text)
    expect(refs.map((r) => r.label)).toEqual(['1', 'note'])
    expect(refs[0].index).toBe(5)
  })
  it('returns empty for plain text', () => {
    expect(collectFootnoteRefs('no refs here')).toEqual([])
  })
})

describe('findFootnoteDef', () => {
  const doc = 'x[^a]\n\n[^a]: the def text\n[^b]: other'
  it('finds the definition text', () => {
    expect(findFootnoteDef(doc, 'a')).toBe('the def text')
  })
  it('null for unknown labels', () => {
    expect(findFootnoteDef(doc, 'zzz')).toBeNull()
  })
})
```

Run: `npx vitest run test/footnotes.test.ts` → FAIL。

- [ ] **Step 2: 实现 footnotes.ts**

```ts
export interface FootnoteRefMatch {
  index: number
  length: number
  label: string
}

/** All `[^label]` references in `text` (definitions `[^label]:` excluded). */
export function collectFootnoteRefs(text: string): FootnoteRefMatch[] {
  const out: FootnoteRefMatch[] = []
  const re = /\[\^([^\]\s]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (text[m.index + m[0].length] === ':') continue // definition line
    out.push({ index: m.index, length: m[0].length, label: m[1] })
  }
  return out
}

/** First-line text of the `[^label]:` definition in the document, or null. */
export function findFootnoteDef(docText: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^\\[\\^${esc}\\]:[ \\t]?(.*)$`, 'm').exec(docText)
  return m ? m[1].trim() : null
}
```

Run: `npx vitest run test/footnotes.test.ts` → PASS。

- [ ] **Step 3: 装饰收集接入**

`decorationSpecs.ts`：

(a) `DecoKind` 追加 `'footnoteRef'`；imports 加：

```ts
import { collectFootnoteRefs, findFootnoteDef } from './footnotes'
import type { SyntaxNode } from '@lezer/common'
```

(b) `collectDecorations` 在 `tree.iterate({...})` 之后、`return specs` 之前追加：

```ts
// Footnote references: the markdown grammar has no footnote rule, so match
// `[^label]` textually and skip matches inside code/tables/frontmatter.
const fullText = doc.toString()
const skipAt = (pos: number): boolean => {
  if (fmEnd > 0 && pos < fmEnd) return true
  let n: SyntaxNode | null = tree.resolveInner(pos, 1)
  while (n) {
    if (
      n.name === 'FencedCode' ||
      n.name === 'InlineCode' ||
      n.name === 'CodeText' ||
      n.name === 'Table'
    ) {
      return true
    }
    n = n.parent
  }
  return false
}
for (const ref of collectFootnoteRefs(fullText)) {
  if (skipAt(ref.index)) continue
  const from = ref.index
  const to = ref.index + ref.length
  const revealed = rangeRevealed(state, from, to)
  if (!revealed) {
    specs.push({
      kind: 'footnoteRef',
      from,
      to,
      revealed,
      source: ref.label,
      info: findFootnoteDef(fullText, ref.label) ?? ''
    })
  }
}
```

- [ ] **Step 4: FootnoteWidget**

`widgets.ts` 追加：

```ts
/** Superscript badge for a `[^label]` footnote reference with hover preview. */
export class FootnoteWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly def: string
  ) {
    super()
  }

  eq(other: FootnoteWidget): boolean {
    return other.label === this.label && other.def === this.def
  }

  toDOM(): HTMLElement {
    const sup = document.createElement('sup')
    sup.className = 'cm-footnote-ref'
    sup.textContent = `[${this.label}]`
    if (this.def) {
      let tip: HTMLElement | null = null
      sup.addEventListener('mouseenter', () => {
        tip = document.createElement('div')
        tip.className = 'cm-footnote-tip'
        tip.textContent = this.def
        const r = sup.getBoundingClientRect()
        tip.style.position = 'fixed'
        tip.style.left = `${r.left}px`
        tip.style.top = `${r.bottom + 6}px`
        document.body.appendChild(tip)
      })
      sup.addEventListener('mouseleave', () => {
        tip?.remove()
        tip = null
      })
    }
    return sup
  }

  ignoreEvent(): boolean {
    return true
  }
}
```

`livePreviewPlugin.ts` imports 加 `FootnoteWidget`，switch 加：

```ts
case 'footnoteRef':
  ranges.push(
    Decoration.replace({
      widget: new FootnoteWidget(s.source ?? '', s.info ?? '')
    }).range(s.from, s.to)
  )
  break
```

- [ ] **Step 5: 样式**

`theme.ts` 追加：

```ts
'.cm-footnote-ref': {
  color: 'var(--accent)',
  fontSize: '11px',
  cursor: 'default',
  padding: '0 1px'
},
```

`src/renderer/src/assets/`（或全局 css，跟随 `.cm-footnote-tip` 不在 editor DOM 内 — 放到全局样式文件，找 `index.css`/`main.css` 中既有全局类旁）追加：

```css
.cm-footnote-tip {
  max-width: 320px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text-dim);
  font-size: 12.5px;
  z-index: 80;
  box-shadow: 0 8px 24px oklch(0 0 0 / 0.35);
}
```

- [ ] **Step 6: 全量 + 提交**

```bash
npm run typecheck && npx vitest run
git add src/renderer/src/editor/livePreview/ test/footnotes.test.ts src/renderer/src/assets/
git commit -m "feat(editor): footnote reference badges with hover preview

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 14: 大文档性能 — 装饰分层（阶段 5）

**Files:**
- Modify: `src/renderer/src/editor/livePreview/decorationSpecs.ts`、`src/renderer/src/editor/livePreview/livePreviewPlugin.ts`、`test/perf/livePreview.bench.test.ts`、`docs/perf-report.md`

**设计**：装饰拆两层 —
- **块层（StateField）**：frontmatter/properties、codeBlock/codeLine、table。这些是块级 replace widget，必须由 state 提供。遍历用「容器跳过」策略：只下钻 `Document/Blockquote/BulletList/OrderedList/ListItem`，其余节点不下钻 → 块层成本 ≈ O(顶层块数)，与行内节点总量无关。
- **行内层（ViewPlugin）**：其余全部（标题、粗斜删、行内代码、链接、图片、hr、task、quote、脚注），只对 `view.visibleRanges` 计算。视口外零成本。

`collectDecorations(state)` 保留为「块层 + 全文行内层」的兼容组合，既有单测不动。

- [ ] **Step 1: 拆分 decorationSpecs（先保持全量行为，测试为证）**

`decorationSpecs.ts` 重构：

(a) 现 `collectDecorations` 主体拆成两个导出函数：

```ts
/** Block-layer specs: frontmatter/properties, fenced code, tables. Cheap —
 *  container-skip traversal never descends into inline forests. */
export function collectBlockSpecs(state: EditorState): DecoSpec[]

/** Inline-layer specs for [from, to]: everything except block widgets. */
export function collectInlineSpecs(state: EditorState, from: number, to: number): DecoSpec[]
```

`collectBlockSpecs` 实现要点：
- 保留现有 frontmatter 段逻辑（fmEnd 检测 + properties/frontmatter specs）。
- `tree.iterate({ enter })`，enter 逻辑：

```ts
const CONTAINERS = /^(Document|Blockquote|BulletList|OrderedList|ListItem)$/
enter: (node) => {
  if (node.to <= node.from) return false
  if (fmEnd > 0 && node.from < fmEnd && node.name !== 'Document') return false
  if (node.name === 'FencedCode') {
    /* 现有 FencedCode 分支原样：未 reveal → codeBlock spec；reveal → codeLine specs */
    return false
  }
  if (node.name === 'Table') {
    /* 现有 Table 分支原样 */
    return false
  }
  return CONTAINERS.test(node.name) // 容器下钻，叶子块跳过
}
```
（`blockGuardEnd` 机制不再需要 — 块层不进入块内部，行内层显式跳过。）

`collectInlineSpecs(state, from, to)` 实现要点：
- `tree.iterate({ from, to, enter })`，enter 沿用现有行内逻辑（headings/HeaderMark/emphasis/inline code/CodeMark/quote/QuoteMark/hr/task/link/image），但：
  - `FencedCode`：`return rangeRevealed(state, node.from, node.to)` —— reveal 时下钻（CodeMark/CodeInfo 照旧），否则跳过整块（已被块层 widget 替换）。
  - `Table`：同样 `return rangeRevealed(...)`。
  - Blockquote 的 `eachLine` 范围用 `Math.max(node.from, from)`、`Math.min(node.to, to)` 截到可见区间。
  - 脚注扫描移到这里，扫 `doc.sliceString(from, to)`（index 加 `from` 偏移）；`findFootnoteDef` 仍查全文（定义可能在视口外）：`findFootnoteDef(doc.toString(), label)` 改为模块内 lazy —— 在循环外取一次 `const fullText = state.doc.toString()` 仅当存在 ref 匹配时。

(b) 兼容导出：

```ts
/** Full-document specs (block + inline). Kept for unit tests and tooling. */
export function collectDecorations(state: EditorState): DecoSpec[] {
  return [
    ...collectBlockSpecs(state),
    ...collectInlineSpecs(state, 0, state.doc.length)
  ]
}
```

- [ ] **Step 2: 回归确认**

Run: `npx vitest run`
Expected: 全部既有装饰测试通过（行为等价）。失败先修到等价再继续。

- [ ] **Step 3: livePreviewPlugin 分层**

`livePreviewPlugin.ts` 重构：

(a) 把现 switch 体提取为：

```ts
function buildSpecRanges(specs: DecoSpec[], state: EditorState): Range<Decoration>[]
```
（switch 内容照搬，含 image/footnoteRef case；返回 ranges 数组。）

(b) 块层 StateField（沿用 reveal 签名缓存）：

```ts
const livePreviewBlocks = StateField.define<LivePreviewValue>({
  create(state) {
    return { deco: blockDeco(state), sig: revealSignature(state) }
  },
  update(value, tr) {
    if (tr.docChanged) return { deco: blockDeco(tr.state), sig: revealSignature(tr.state) }
    if (tr.selection) {
      const sig = revealSignature(tr.state)
      if (sig === value.sig) return value
      return { deco: blockDeco(tr.state), sig }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

function blockDeco(state: EditorState): DecorationSet {
  return Decoration.set(buildSpecRanges(collectBlockSpecs(state), state), true)
}
```

(c) 行内层 ViewPlugin：

```ts
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

const livePreviewInline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    sig: string

    constructor(readonly view: EditorView) {
      this.sig = this.signature(view)
      this.decorations = this.build(view)
    }

    update(u: ViewUpdate): void {
      const sig = this.signature(u.view)
      if (u.docChanged || u.viewportChanged || sig !== this.sig) {
        this.sig = sig
        this.decorations = this.build(u.view)
      }
    }

    signature(view: EditorView): string {
      return (
        revealSignature(view.state) +
        '|' +
        view.visibleRanges.map((r) => `${r.from}-${r.to}`).join(',')
      )
    }

    build(view: EditorView): DecorationSet {
      const ranges: Range<Decoration>[] = []
      for (const vr of view.visibleRanges) {
        ranges.push(...buildSpecRanges(collectInlineSpecs(view.state, vr.from, vr.to), view.state))
      }
      return Decoration.set(ranges, true)
    }
  },
  { decorations: (v) => v.decorations }
)
```

(d) 导出改为组合（Editor 端用法不变）：

```ts
export const livePreview = [livePreviewBlocks, livePreviewInline]
```

- [ ] **Step 4: 回归 + 修复**

Run: `npx vitest run && npm run typecheck`
Expected: 全绿。`livePreview-dom` 等挂真实 EditorView 的测试在 jsdom 中 visibleRanges 覆盖整文档（无布局高度），装饰行为与之前一致。

- [ ] **Step 5: bench 扩展 300K 档**

`test/perf/livePreview.bench.test.ts` 追加（按现有 bench 风格适配 helper 名）：

```ts
it('xl document: inline pass over a 4K-char window vs full doc', () => {
  const doc = buildDoc(150 * 4) // 4x the current "large" tier → ~370K chars
  const state = stateFor(doc)   // 复用现有 state 构造 helper
  const t0 = performance.now()
  for (let i = 0; i < 20; i++) collectInlineSpecs(state, 100_000, 104_000)
  const windowMs = (performance.now() - t0) / 20
  const t1 = performance.now()
  for (let i = 0; i < 5; i++) collectBlockSpecs(state)
  const blockMs = (performance.now() - t1) / 5
  console.log(`[xl] inline(4K window): ${windowMs.toFixed(3)}ms  block(full): ${blockMs.toFixed(3)}ms`)
  expect(windowMs + blockMs).toBeLessThan(2)
})
```

Run: `npx vitest run test/perf/livePreview.bench.test.ts`
Expected: PASS，`inline(4K window) + block(full) < 2ms`。

- [ ] **Step 6: 更新 perf-report + 提交**

`docs/perf-report.md` 末尾追加一节「7. 阶段 5：装饰分层（视口行内层 + 容器跳过块层）」记录 xl bench 数字与设计两段。

```bash
npm run typecheck && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml
git add src/renderer/src/editor/livePreview/ test/perf/livePreview.bench.test.ts docs/perf-report.md
git commit -m "perf(editor): split decorations into viewport-scoped inline layer and container-skip block layer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 15: 收尾验证

- [ ] **Step 1: 全量门禁**

```bash
npm run typecheck && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml
```
Expected: 全绿。

- [ ] **Step 2: 真机/演示验证清单**（demo 浏览器环境无 Tauri IPC，编辑器内功能用 `npm run demo`；涉及文件 IO 的用 `npm run dev` 真机）

demo 可验（编辑器层）：
1. 中文输入法开启时输入 `/`（行首与空格后）→ 菜单弹出；`http://` 第二个 `/` 不弹。
2. `![alt](https://…png)` 外链图片渲染；光标进入该行还原源码；坏链接显示占位。
3. checkbox 点击切换；表格 Tab/Shift-Tab、末格 Tab 加行、悬浮工具条增删行列。
4. `[^1]` 徽标 + hover 预览。
5. 粘贴 300K 字符文档，连续打字与滚动无感知卡顿。

真机验（`npm run dev`）：
6. 本地相对路径图片渲染（asset 协议）。
7. Cmd+点击外链 → 默认浏览器；Cmd+点击相对 `.md` → 库内跳转。
8. 编辑不保存 → `kill -9` 应用 → 重开同文件 → 草稿恢复条出现，恢复内容正确。
9. 外部用其他编辑器改当前文件 → 冲突条出现；两个按钮行为正确；不 dirty 时静默重载且编辑器内容刷新。

- [ ] **Step 3: 按 superpowers:finishing-a-development-branch 收尾**
