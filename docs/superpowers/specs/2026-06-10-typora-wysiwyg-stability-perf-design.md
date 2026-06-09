# Margin 编辑器：趋近 Typora + 稳定性 + 性能 — 设计文档

日期：2026-06-10 · 状态：已确认

## 目标

1. 修复「普通输入 + `/` 下拉菜单时开时不开」的稳定性 bug。
2. 补齐趋近 Typora 的关键渲染/交互能力：图片内联、任务勾选可点击、表格交互、链接跳转、脚注预览。
3. 数据安全：崩溃恢复、外部修改冲突检测。
4. 大文档（300K 字符级）按键路径性能 < 2ms。

明确不做：KaTeX 数学公式、可拖拽块排序、自定义快捷键。

## 现状基线

- 编辑器：CodeMirror 6，live preview 由 StateField（`livePreviewPlugin.ts`）提供装饰；
  `decorationSpecs.ts` 遍历语法树产出 spec；`reveal.ts` 按行 reveal。
- 已实现 WYSIWYG：标题、粗斜删、行内代码、链接样式、任务列表（只读）、引用、分割线、
  代码块 widget、表格 widget（contentEditable）、frontmatter 属性面板。
- 未实现：图片、脚注、链接跳转、checkbox 交互。
- 工作区有一批已验证未提交改动（按键重渲染修复 + 项目级配置），先行提交（阶段 0）。

## 阶段 0 — 提交现有工作

把已验证的改动拆成两个 commit：
1. `perf:` 按键路径重渲染修复 + reveal 签名缓存 + perf 基准测试 + 报告。
2. `feat:` 项目级配置（`.margin/config.json`）前后端 + 测试。

## 阶段 1 — 输入与 `/` 菜单稳定性

### 根因

`Editor.tsx` 用 keymap 拦截 `/` 按键：

1. 中文 IME 组合输入期间按键事件为 keyCode 229，keymap 收不到 `/` → 菜单不弹（主因）。
2. `setTimeout(0)` 后 `coordsAtPos` 返回 `null` 时静默失败。
3. keymap 在字符插入前运行，`from: pos + 1` 假设 `/` 必然上屏。

### 方案

- 移除 `/` keymap，改为 `EditorView.updateListener`：检测事务中**实际插入**的单个
  `/` 字符，且 `userEvent` 为 `input.type`（含 IME composition 上屏）——普通输入与
  输入法输入均覆盖，粘贴（`input.paste`）不触发。
- 触发条件沿用 `slashMenuTriggers(charBefore)`：行首或前一字符为空白。
- 坐标用 `view.requestMeasure` 读取，测量失败重试一帧而非静默放弃。
- 菜单打开后：继续输入按文本过滤选项；`Esc`/失焦/光标离开触发区间/文档在区间外变化
  → 关闭；选中后替换 `/` 起的整段触发文本。

### 测试

- 单测：事务驱动触发器（插入 `/` 的多种 userEvent、IME composition 序列）。
- DOM 测试：模拟 compositionstart → compositionend 上屏 `/`，断言菜单出现；
  `http://` 第二个 `/` 不弹；过滤与关闭行为。

## 阶段 2 — 数据安全

### 2a 崩溃恢复（草稿）

- dirty 状态下每 2s 将未保存内容写入 `<vault>/.margin/drafts/<sha1(相对路径)>.md`
  （复用 `.margin` 机制：path_policy 已允许、vault_scanner 已跳过）。
- 保存成功 → 删除对应草稿。
- 打开文件时：若存在草稿、其 mtime 晚于文件且内容不同 → 编辑器顶部条
  「检测到未保存草稿：恢复 / 丢弃」。恢复 = 载入草稿内容并标记 dirty；丢弃 = 删草稿。
- 后端新增命令：`write_draft` / `read_draft` / `delete_draft`（均限定在 `.margin/drafts`）。
- 草稿写失败仅记录、不打断编辑。

### 2b 外部修改冲突检测

- 复用现有文件 watcher：当前打开文件收到外部变更事件时读取磁盘内容：
  - 与 `savedContent` 相同 → 忽略（自己刚保存的回声）。
  - 编辑器不 dirty → 自动重载，状态条短暂提示「已从磁盘重载」。
  - 编辑器 dirty → 顶部冲突条「磁盘版本已变化：保留我的（下次保存覆盖）/ 载入磁盘版本」。
- 保存路径加固：保存前若检测到磁盘内容 ≠ 上次加载/保存的内容且用户未选「保留我的」，
  弹冲突条而非直接写入——不静默覆盖。

## 阶段 3 — 图片内联渲染

- `decorationSpecs.ts` 处理 `Image` 节点：未 reveal 时整行替换为 `ImageWidget`
  （统一按块级 widget 处理，行内图后续再议）；光标进入该行 → 还原 `![alt](src)` 源码。
- 路径解析：
  - `http(s)://` → 直接作为 `<img src>`。
  - 相对路径 → 相对当前文件所在目录解析为绝对路径，优先 `convertFileSrc`
    （Tauri asset 协议）；若协议不可用则 IPC 读字节 + blob URL 兜底。
- 加载失败 → 占位框显示 alt 文本与路径，不抛错。
- 已加载图片的自然尺寸进模块级缓存（key=解析后 URL），重建装饰时以缓存尺寸先占位，
  避免滚动/编辑时布局跳动。
- 样式：最大宽度跟随编辑列（720px），圆角、居中。

## 阶段 4 — 交互增强

- **任务勾选**：`CheckboxWidget` 绑定 click → dispatch 替换 `[ ]`↔`[x]`（按 marker
  精确位置），widget 不再只读。
- **表格**：
  - 单元格内 Tab / Shift-Tab → 下一格 / 上一格（跨行衔接）。
  - 末行末格 Tab → 追加新空行（Typora 行为）。
  - 表格 hover 显示小工具条：增/删行、增/删列。
  - 所有结构变更走「模型变换 → 重新序列化 markdown → dispatch」既有路径。
- **链接**：Cmd/Ctrl+点击——`http(s)` 用系统默认浏览器打开（Tauri opener）；
  相对 `.md` 路径 → 调 `openFileByPath` 在库内跳转；目标不存在 → 状态条提示。
- **脚注**：`[^n]` 引用渲染为上标徽标；hover 浮层显示对应定义文本（纯文本预览）；
  定义块 `[^n]: ...` 保持源码不做 widget。

## 阶段 5 — 大文档性能

- 装饰拆分：
  - **行内/行级装饰**（标记隐藏、标题样式、引用线等）移入按 `view.visibleRanges`
    （±一屏余量）计算的 ViewPlugin——视口外不再付出遍历与装饰成本。
  - **块级 widget**（代码块/表格/属性面板/hr/图片，影响垂直布局，不能依赖视口）
    留在 StateField；docChanged 时仅重算变更行区间 ± 上下文，其余装饰 `deco.map` 平移。
- reveal 签名缓存机制保留，两层各自适用。
- 验收：`livePreview.bench` 扩展 300K 字符档位，按键 / 跨行光标移动中位数 < 2ms；
  全部既有装饰测试不回归。

## 错误处理原则

- 图片加载、草稿读写、链接打开失败：降级显示/提示，不抛错、不打断输入。
- 冲突场景永不静默覆盖磁盘内容。
- 所有新增 Tauri 命令路径均经 path_policy 校验。

## 测试策略

- 每阶段 TDD：先写失败测试再实现。
- 全程 `npm run typecheck` + `npx vitest run` + `cargo test` 全绿后才进下一阶段。
- 阶段 1/3/4 完成后用 preview 真机验证：中文 IME 输入 + `/` 菜单、图片渲染、
  表格 Tab 导航、checkbox 点击。

## 实施顺序与提交

阶段 0 → 1 → 2 → 3 → 4 → 5，每阶段独立 commit（conventional commits），
任一阶段可独立回滚。
