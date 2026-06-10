# Margin — 交互/性能测试与修复报告

日期：2026-06-09 · 范围：本地启动后的交互延迟（“个人感知：交互延迟很高”）

---

## 1. 测试方案

### 目标
量化“打字 / 移动光标 / 点击”等交互的主线程耗时，定位延迟根因并修复，附前后对比。

### 假设的热路径（每次按键都会发生的工作）
1. **编辑器装饰层** — `livePreview` StateField 在 `docChanged || selection` 时重建装饰
   （`collectDecorations` 遍历整篇文档语法树）。
2. **React 重渲染** — `App` 订阅了 `content`，每次按键 → `setContent` → 整棵树
   （`Sidebar → FileTree → 每一行`）重新协调，即使文件树未变。
3. **每次按键的 `doc.toString()`** + Zustand 存储拷贝。

### 方法（headless、可复现）
用 vitest + jsdom 做微基准，隔离两条路径，取多次中位数：

| 基准文件 | 测什么 |
| --- | --- |
| `test/perf/livePreview.bench.test.ts` | 真实挂载 CodeMirror + livePreview，量化「装饰重建 / 按键 / 跨行光标移动 / 同行光标移动」耗时（小/中/大文档） |
| `test/perf/render.bench.test.tsx` | 量化「一次由父级驱动的 FileTree 重渲染」的耗时（小/中/大文件库） |
| `test/app-rerender.test.tsx` | 回归守卫：内容变化**不得**重渲染文件树 |

运行：
```bash
npx vitest run test/perf/livePreview.bench.test.ts test/perf/render.bench.test.tsx
npx vitest run test/app-rerender.test.tsx
```

---

## 2. 执行结果（基线 / 根因证据）

### 编辑器装饰层（每次按键/光标移动，单位 ms，中位数）
| 文档规模 | 行数 | 字符 | collectDeco | 按键 | 光标移动 |
| --- | --- | --- | --- | --- | --- |
| 小 | 125 | 3.1K | 0.40 | 1.39 | 0.51 |
| 中 | 965 | 24.7K | 0.43 | 1.18 | 0.74 |
| 大 | 3605 | 92.7K | 1.29 | 2.92 | 2.14 |

→ 编辑器成本真实但**不大**（1–3ms），不足以解释“延迟很高”。

### React 文件树重渲染（每次按键都会发生，单位 ms）
| 文件库规模 | 行数 | 一次重渲染 |
| --- | --- | --- |
| 小 | 55 | 1.78 |
| 中 | 520 | **7.33** |
| 大 | 2040 | **28.14** |

→ **根因在此。** `App` 订阅 `content`，导致**每一次按键**都同步重渲染整棵文件树
（行内含 Lucide SVG 图标），而文件树内容根本没变。中等文件库 7ms、大文件库 28ms/按键，
快速输入时主线程跟不上 60fps，表现为明显卡顿。回归守卫 `app-rerender.test.tsx` 证明：
3 次按键 → 文件树渲染了 4 次（基线 + 每次按键 1 次）。

---

## 3. 根因与修复

### 根因 1（主因）：每次按键都全量重渲染文件树
`App` 通过 `useDocumentStore((s) => s.content)`（以及 `dirty`、`saveStatus`、`useDocStats(content)`）
订阅了内容，按键改变 `content` → `App` 重渲染 → 未 memo 的 `Sidebar/FileTree/FileTreeRow` 全部重协调。

**修复（`App.tsx` / `StatusBar.tsx` / `Sidebar.tsx`）：**
- `App` 仅订阅 `path`（开文件才变），不再订阅 `content`。
- 把内容消费者下沉为**叶子订阅者**：
  - `StatusBar` 自己订阅 `content`/`saveStatus`（字数统计仍 200ms 防抖）。
  - 新增 `DirtyDot` 叶子组件订阅“是否未保存”。
  - 编辑器通过 `useDocumentStore.getState().content` **非响应式**读取初值
    （编辑器是非受控、以 `path` 为 key，仅挂载时取一次）。
- `Sidebar` 用 `React.memo` 包裹，配套用 `useCallback` 稳定回调引用 →
  即使 `App` 因其他原因重渲染（弹窗 / 抽屉 / 主题），文件树也不再重协调（纵深防御）。

### 根因 2（次因）：光标移动也全量重建装饰
`livePreview` 在任意 `selection` 变化时都重建全部装饰。但 Typora 式 reveal 是**按行**的，
**同一行内移动光标**（左右方向键 / 行内点击）装饰结果完全相同。

**修复（`livePreviewPlugin.ts`）：** 缓存一个“被选中行签名”，签名不变则复用上次装饰，跳过重建。
保持正确性：签名不同则照旧重建。

---

## 4. 修复后对比

### 编辑器（新增「同行光标移动」列）
| 文档规模 | collectDeco | 按键 | 移动(跨行) | 移动(同行) |
| --- | --- | --- | --- | --- |
| 小 | 0.35 | 1.25 | 0.91 | **0.110** |
| 中 | 0.40 | 1.30 | 0.79 | **0.129** |
| 大 | 1.52 | 3.16 | 2.45 | **0.354** |

→ 同行光标移动从 ~2.14ms 降到 ~0.35ms（大文档），约 **6×**；跨行仍按需重建。

### React 文件树（按键路径）
- `render.bench` 仍显示一次重渲染要 7–28ms —— 但 `app-rerender.test.tsx` 证明该成本
  **每次按键已被完全避免**：内容变化后文件树渲染次数 = 基线（不再增加）。
- 净效果：在中/大型文件库下，**每次按键省去 7–28ms 的主线程阻塞**，这是“交互延迟很高”的主因消除。

---

## 5. 扩展：项目级配置目录

需求：增加目录配置文件夹，存储项目级配置。

**设计**：每个文件库在隐藏目录 `<vault>/.margin/config.json` 存储项目级设置；
localStorage 继续作为机器级默认值，项目配置作为该库的覆盖项，随库迁移。

实现要点：
- **后端**（`src-tauri/src/commands.rs` + `main.rs`）：新增 `read_project_config` /
  `write_project_config` 命令；写入时 `create_dir_all(.margin)`。`.margin` 被 `path_policy`
  允许、被 `vault_scanner` 跳过（不出现在文件树）。
- **前端**：`api.ts`/`ipc.ts` 暴露两个方法；`settingsStore` 增加 `applyProjectConfig`
  （仅改内存、不写 localStorage）、`projectConfigOf`、`sanitizeProjectConfig`（校验不可信输入）。
- **桥接**（`hooks/useProjectConfig.ts`）：开库时加载并覆盖；设置变更且有库打开时回写
  （`hydrating` 标志防止加载即回写的回环）。
- `SettingsPanel` 增加一行说明配置存储位置。

覆盖测试：`test/projectConfig.test.ts`、`test/useProjectConfig.test.tsx`、
`commands::tests::project_config_round_trip_and_missing`（Rust）。

---

## 6. 验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（node + web） | ✅ 通过 |
| `npx vitest run`（全量） | ✅ 28 文件 / 127 用例通过 |
| `cargo test`（src-tauri） | ✅ 12 用例通过 |
| `cargo check` | ✅ 通过（仅 1 个既有无关 warning） |

> 说明：本仓库为 Tauri 桌面应用，交互延迟以 headless 微基准量化主线程 JS 成本
> （这正是可感知卡顿的来源）；真机的 GPU 绘制成本未纳入，但根因（每按键 7–28ms 的
> JS 重渲染）已被消除。
