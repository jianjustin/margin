---
title: Margin M3 — Bear 主题 + IBM Plex 排版 + 跟随系统切换
tags: [项目, 笔记软件, spec, theme, m3]
created: 2026-05-31
parent: 2026-05-31-margin-wysiwyg-editor-design.md
status: approved
---

# Margin M3 — 设计 Spec

## 0. 背景与范围

M0–M2 已交付：Electron + React + CodeMirror 6 的 Typora 式所见即所得编辑器，
单文件读写，光标感知 live-preview。当前主题是脚手架阶段**粗糙的 shadcn 中性暗色**
（`src/renderer/src/index.css` 里手填的 HSL 值），与交互稿的 Bear 暖金观感不符。

M3 把视觉对齐到交互稿（`docs/design/margin/project/margin.css`）：精确的 **Bear 暖金
oklch 调色板**（暗 + 亮）、**IBM Plex 字体**、**720pt 版心排版**，并新增**跟随系统 +
手动覆盖**的亮/暗切换。

本次为纯视觉/主题层，**不动编辑器内核逻辑、不动 IPC、不动文档真相**。

## 1. 不可妥协约束（继承）

- markdown 文本是唯一真相，往返逐字无损（主题层不碰文档）。
- 本地优先：主题偏好存 localStorage，不进 vault，不联网。
- `index.html` CSP 维持本地优先：字体是打包进 bundle 的本地资源，不放开网络源。

## 2. 色彩令牌架构（语义 oklch 为真相 + 映射 shadcn）

唯一真相 = 交互稿的**语义 oklch 令牌**。新建 `src/renderer/src/theme/tokens.css`。

### 2.1 暗色（`:root`，默认）

| 令牌 | oklch |
|---|---|
| `--bg` | `0.165 0.006 70` |
| `--bg-panel` | `0.205 0.006 70` |
| `--bg-elev` | `0.245 0.007 70` |
| `--bg-hover` | `0.275 0.008 70` |
| `--border` | `0.305 0.006 70` |
| `--border-soft` | `0.255 0.006 70` |
| `--text` | `0.905 0.01 85` |
| `--text-dim` | `0.66 0.01 80` |
| `--text-faint` | `0.49 0.01 80` |
| `--accent`（暖金） | `0.82 0.11 90` |
| `--accent-ink` | `0.30 0.05 80` |
| `--accent-soft` | `0.82 0.11 90 / 0.14` |
| `--accent-line` | `0.82 0.11 90 / 0.32` |
| `--sel` | `0.82 0.11 90 / 0.20` |
| `--red` | `0.62 0.18 25` |

### 2.2 亮色（`[data-theme="light"]`）

| 令牌 | oklch |
|---|---|
| `--bg` | `0.975 0.005 85` |
| `--bg-panel` | `0.945 0.007 85` |
| `--bg-elev` | `0.995 0.003 85` |
| `--bg-hover` | `0.915 0.009 85` |
| `--border` | `0.875 0.008 85` |
| `--border-soft` | `0.915 0.007 85` |
| `--text` | `0.265 0.012 75` |
| `--text-dim` | `0.46 0.012 75` |
| `--text-faint` | `0.64 0.012 75` |
| `--accent` | `0.60 0.12 70` |
| `--accent-ink` | `0.99 0.02 90` |
| `--accent-soft` | `0.60 0.12 70 / 0.12` |
| `--accent-line` | `0.60 0.12 70 / 0.30` |
| `--sel` | `0.60 0.12 70 / 0.18` |

### 2.3 映射 shadcn

现有 `index.css` 里手填的 shadcn HSL 暗色/亮色值被**移除**，改为引用语义令牌，
保证未来 shadcn 组件与 CM6 共用同一真相：

```
--background: var(--bg)
--foreground: var(--text)
--card / --popover: var(--bg-panel)
--primary: var(--accent)
--primary-foreground: var(--accent-ink)
--secondary / --muted / --accent(shadcn): var(--bg-elev)
--muted-foreground: var(--text-dim)
--border / --input: var(--border)
--ring: var(--accent)
--destructive: var(--red)
```

> shadcn 的 Tailwind 配置用 `hsl(var(--background))` 包裹。因我们把这些令牌设成 oklch
> 值（`var(--bg)`），需要让 Tailwind 直接吃 `var(--background)`（不再包 `hsl()`）。
> 实施时把 `tailwind.config.js` 的颜色从 `hsl(var(--x))` 改为 `var(--x)`，令牌值本身
> 是完整 oklch 颜色。M3 实际用到的是 background/foreground/primary/muted/border/ring；
> 全量改齐以免半套混用。

### 2.4 CM6 主题改用语义令牌

`src/renderer/src/editor/livePreview/theme.ts` 现用 `hsl(var(--primary))` 等。
改为直接用语义令牌：`var(--text)`（caret）、`var(--accent)`（链接/引用条/选区）、
`var(--bg-elev)`（行内码/代码块底）、`var(--border)`（hr）、`var(--text-dim)`
（删除线/frontmatter/h6）。选区用 `var(--sel)`。`{ dark: true }` 标记**移除**——
因为现在亮色也支持，base 明暗交给 CSS 变量级联，不再硬编码 dark。

## 3. IBM Plex 字体 + 排版

### 3.1 字体引入（@fontsource）

npm 依赖：`@fontsource/ibm-plex-sans`、`-mono`、`-serif`、`-sans-sc`（woff2，MIT，
随 bundle 打包，离线可用）。

新建 `src/renderer/src/theme/fonts.ts`，集中 import 所需字重，由 `main.tsx` 引一次：
- Sans / Mono / Sans-SC：weight 400 / 500 / 600
- Serif：weight 400 / 500

### 3.2 字体栈令牌（接交互稿，放进 tokens.css）

```
--ui:    "IBM Plex Sans","IBM Plex Sans SC",system-ui,sans-serif
--mono:  "IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace
--serif: "IBM Plex Serif",Georgia,serif
```

字体文件缺失时优雅降级到回退链，不阻断启动。

### 3.3 排版（spec §7 + 交互稿）

- 正文 16pt、行距 **1.72**、段间距 8pt，字族 `--ui`。
- 标题比例 H1 1.62em / H2 1.32em / H3 1.1em（保留 theme.ts 现值）。
- 编辑区最大宽 **720pt** 居中，padding 56/40pt（保留 Editor.tsx 现值）。
- 代码块 / 行内码用 `--mono`。
- body 全局字族设为 `--ui`（替换当前 Editor.tsx 内联的 system sans）。

### 3.4 CSP 调整

`index.html` 的 CSP 加 `font-src 'self' data:`（@fontsource 的 woff2 经 Vite 打包为
本地资源，仍属本地优先；不放开任何网络源）。

## 4. 跟随系统 + 手动覆盖

### 4.1 三态模型

`ThemeMode = 'auto' | 'light' | 'dark'`。默认 `auto`。

### 4.2 状态（`src/renderer/src/stores/themeStore.ts`，Zustand）

- `mode: ThemeMode`，从 `localStorage['margin.themeMode']` 初始化（缺省 `auto`）。
- `setMode(mode)`：更新并写回 localStorage。
- `cycleMode()`：auto → light → dark → auto。

### 4.3 有效主题计算（纯函数）

`resolveTheme(mode, systemDark): 'light' | 'dark'`：
`mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode`。

### 4.4 系统信号 + 应用（effect）

- 用 `window.matchMedia('(prefers-color-scheme: dark)')` 读系统、监听 `change`。
  （renderer 的 `prefers-color-scheme` 已如实跟随 macOS；不走 IPC / `nativeTheme`。）
- effect 计算有效主题 → 给 `document.documentElement` 设 `data-theme="light"`
  （暗色为 `:root` 默认，不设属性即暗）。
- CM6 靠 CSS 变量级联自动重渲染，**不重建 EditorView**。

### 4.5 切换入口（标题栏按钮）

`App.tsx` 标题栏（现仅 "Open…"）加一个主题切换按钮：点击 `cycleMode()`，
图标随当前 `mode` 变（auto=🖥 / light=☀️ / dark=🌙，或等价 lucide 图标 Monitor/Sun/Moon）。
完整标题栏留 M5；此处放一个能用的最小按钮。

## 5. 文件结构

```
src/renderer/src/
├─ theme/
│  ├─ tokens.css          新增：语义 oklch 令牌(暗/亮) + 字体栈 + shadcn 映射
│  └─ fonts.ts            新增：@fontsource import 集中点
├─ stores/
│  └─ themeStore.ts       新增：ThemeMode 状态 + 持久化 + resolveTheme 纯函数
├─ hooks/
│  └─ useSystemTheme.ts   新增：matchMedia 订阅 → systemDark 布尔
├─ index.css              改：去掉手填 shadcn HSL，import tokens.css
├─ main.tsx               改：import fonts.ts
├─ App.tsx                改：主题 effect(套 data-theme) + 标题栏切换按钮
├─ components/
│  └─ ThemeToggle.tsx     新增：循环切换按钮(图标随 mode)
└─ editor/livePreview/
   └─ theme.ts            改：hsl(var(--x)) → 语义 oklch 令牌；去掉 { dark: true }
tailwind.config.js        改：颜色 hsl(var(--x)) → var(--x)
index.html                改：CSP 加 font-src
package.json              改：加 4 个 @fontsource 依赖
```

## 6. 测试策略

- **纯逻辑 TDD（node 单测）**：
  - `resolveTheme(mode, systemDark)` 全分支。
  - `themeStore`：默认 auto、setMode/cycleMode 转移、localStorage 持久化（mock）。
- **DOM 冒烟（jsdom，扩展现有 livePreview-dom 或新建）**：套 `data-theme="light"`
  后 `document.documentElement` 属性正确；编辑器仍正常挂载不抛错。
- **手动 GUI 验收**：用户 `npm run dev` 看 Bear 暖金观感、IBM Plex 是否生效、
  切换按钮三态、跟随系统（改 macOS 外观）是否实时变。
- 全程 `npm run typecheck` + `npm run build` 必过。

## 7. 分阶段路线（实现计划会细化）

| 阶段 | 交付 |
|---|---|
| M3a | tokens.css(暗/亮 oklch + 字体栈 + shadcn 映射) + index.css/tailwind 改造；编辑器换上真 Bear 暗色 |
| M3b | @fontsource 字体引入 + 排版(行距 1.72 等) + CSP |
| M3c | themeStore + resolveTheme + useSystemTheme + data-theme effect + 切换按钮 |

每段独立提交；M3c 末做 DOM 冒烟 + 用户 GUI 验收。

## 8. 显式非目标（M3 不做）

- 5 种 accent 切换（仅暖金；其余留 v2）。
- 字号/字族 runtime 调节 UI（留 v2，§7 设置面板）。
- Serif 在正文/标题实际启用（仅保留备用栈）。
- 完整标题栏（面包屑/脏点/多按钮）——留 M5；M3 只加一个主题按钮。
- `nativeTheme` IPC（matchMedia 已够）。

## 9. 关键决策记录

- 字体：@fontsource npm 包（离线、随包、import 即用），非手放 ttf。
- 切换：跟随系统(auto) + 手动覆盖(light/dark) 三态，localStorage 持久化。
- 令牌：语义 oklch 为唯一真相，shadcn HSL 令牌改为引用之（Tailwind 去掉 hsl() 包裹）。
- 亮色从原 v2 提前到 M3（用户决定）。
