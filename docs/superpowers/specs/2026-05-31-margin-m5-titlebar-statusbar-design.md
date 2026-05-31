---
title: Margin M5 — 标题栏（面包屑+脏点）+ 底部状态栏（统计）
tags: [项目, 笔记软件, spec, m5, statusbar]
created: 2026-05-31
parent: 2026-05-31-margin-wysiwyg-editor-design.md
status: approved
---

# Margin M5 — 设计 Spec

## 0. 背景与范围

M0–M4 已交付：Electron + React + CM6 的 Typora 式编辑器，Bear 主题 + 跟随系统，
文件树侧栏 + watch + CRUD。当前顶部 header 还带一个单文件「Open…」按钮（M4 后冗余），
没有面包屑、脏点，也没有字数/块数统计。

M5 是路线图最后一个里程碑：把 header 收成正式**标题栏**（面包屑 + 脏点），加一条
**底部状态栏**（字符/词/分钟/块数 + 保存状态），并**彻底移除单文件 Open… 入口**
（打开文件只走侧栏文件树）。纯 UI/展示层，不动编辑器内核、IPC、文档真相。

## 1. 不可妥协约束（继承）

- markdown 文本是唯一真相；统计只读不写，不碰文档。
- 本地优先；纯前端计算，无 IPC、无联网。

## 2. 统计计算（纯逻辑）

新建 `src/renderer/src/lib/computeStats.ts`：

```ts
export interface DocStats {
  chars: number    // CJK 字数
  words: number    // CJK 字数 + 英文词数
  minutes: number  // 阅读分钟
  blocks: number   // 顶层块数
}
export function computeStats(markdown: string): DocStats
```

规则（接 spec §8.3）：
- **chars（CJK 字数）**：正则 `[一-鿿぀-ヿ가-힯]` 全局匹配数。
- **英文词数**：正则 `[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*` 全局匹配数。
- **words** = chars + 英文词数。
- **minutes** = `max(1, Math.round(words / 320))`（空文档也至少显示约 1 分钟？见下）。
  - 修正：空文档 words=0 → minutes 显示 0（不强行 1）；非空且 words>0 时 `max(1, round)`。
- **blocks**：按一个或多个空行分割文本，统计**非空**段落块数。空文档 = 0 块。
  （轻量启发式，不引 markdown 解析器，保持纯函数独立可测。）

## 3. 组件

### 3.1 StatusBar（`src/renderer/src/components/StatusBar.tsx`）

- 高 28px，`bg-panel` 底，顶部 1px `border-soft`，字号 11.5px，色 `text-faint`，
  数字 `font-variant-numeric: tabular-nums`。
- 左：`<chars> 字符 · <words> 词 · 约 <minutes> 分钟`。
- 右：`<blocks> 块` + 保存状态（已保存 / 保存中… / 保存失败，状态非「已保存」时用 accent/红）。
- 无打开文件时：状态栏仍渲染但显占位（`— 字符 · — 词`）或留空；选定方案：显示全 0
  （`0 字符 · 0 词 · 0 分钟` / `0 块`），保存状态隐藏。

### 3.2 标题栏（改造现有 `App.tsx` header）

- **移除**：单文件「Open…」按钮 + `openFileDialog()` 逻辑 + 对应 import。
- 保留：左侧栏切换按钮（PanelLeft）、右 ThemeToggle。
- 新增中部**面包屑** `<父目录名> / <文件名>`：
  - 12.5px `text-dim`；父目录名 `text-faint`；文件名超长 `text-overflow: ellipsis` 截断。
  - 末尾**脏点** ● 6px：`accent` 色，`documentStore.isDirty()` 为真时 opacity 0→1。
  - 无打开文件：显示「No file open」淡字。
- 现有「保存状态」文字从 header **移到状态栏右侧**（§3.1），header 不再重复。

## 4. 布局接线（App.tsx）

```
<div h-screen flex-col>
  <header>  ← 标题栏：侧栏切换 + 面包屑+脏点 + ThemeToggle
  <div flex flex-1>  ← 侧栏 + 编辑区
  <StatusBar/>  ← 新增，整窗底部
</div>
```

- 统计源 = `documentStore.content`；用 debounce 200ms 的本地 state 持有 `DocStats`，
  避免每次按键全量重算渲染。debounce 在 App（或一个 `useDocStats(content)` hook）里做。
- `window.margin.openFile` 的 IPC 通道与 main/preload 实现**保留**（无害，未来或用），
  M5 仅删除 renderer 的 UI 入口与调用。

## 5. 文件结构

```
src/renderer/src/
├─ lib/computeStats.ts        新增（纯函数）
├─ hooks/useDocStats.ts       新增：debounce 200ms 持有 DocStats
├─ components/StatusBar.tsx   新增
└─ App.tsx                    改：去 Open… 按钮、加面包屑+脏点、底部挂 StatusBar
test/
├─ computeStats.test.ts       新增
└─ statusBar-dom.test.tsx     新增（jsdom + RTL）
```

## 6. 测试策略

- **纯逻辑 TDD（node）** `computeStats`：纯中文、纯英文、中英混合、空文档（全 0）、
  多段落块数、单段落、minutes 下限（words>0 → ≥1；空 → 0）。
- **DOM 冒烟（jsdom + RTL）** StatusBar：给定 content 渲染对应数字；保存状态文案；
  面包屑显示父目录/文件名 + 脏点随 `isDirty()` 出现/消失。
- **手动 GUI 验收**：真实笔记看统计准确、脏点闪现、保存状态流转、面包屑截断、
  Open… 按钮确实消失、无文件时状态栏占位。
- 全程 `npm run typecheck` + `npm run build` 必过。

## 7. 分阶段路线（实现计划细化）

| 阶段 | 交付 |
|---|---|
| M5a | `computeStats`（TDD）+ `useDocStats` debounce hook |
| M5b | `StatusBar` 组件 + 挂到 App 底部 |
| M5c | 标题栏改造：移除 Open…、加面包屑+脏点、保存状态迁到状态栏；DOM 测试；验收 |

每段独立提交；M5c 末 DOM 冒烟 + 用户 GUI 验收 + 推送。

## 8. 显式非目标（M5 不做）

- 字数目标 / 阅读进度条。
- 可点面包屑跳转父目录。
- 状态栏可配置（显示哪些指标）。
- 实时打字速度 / 会话计时。
- 删除 openFile 的 IPC 通道（仅删 UI 入口）。

## 9. 关键决策记录

- 统计放**底部独立状态栏**（跟 spec §8；交互稿后期改内联，但用户选回独立状态栏）。
- 面包屑仅「父目录 / 文件名」（非完整相对路径）。
- 单文件 Open… 入口**彻底移除**，打开文件只走侧栏文件树（IPC 通道保留）。
- 统计为纯前端启发式，不引 markdown 解析器，保持可测。
