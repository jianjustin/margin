# 所见即所得 Markdown 编辑器 — 功能清单

> 最后更新：2026-06-24
> 适用：Margin（Tauri v2 + React + CodeMirror 6）

本文档从产品视角列出**一个完整的 WYSIWYG Markdown 编辑器需要哪些功能**，并标注 Margin 的现状。
它既是验收清单，也是 editor-core（平台无关内核，见 [ARCHITECTURE.md](ARCHITECTURE.md)）补全工作的
对照表。

**状态图例**：✅ 已实现　🟡 部分实现 / 有缺口　⬜ 规划中
**层次标注**：`[core]` = 逻辑在 editor-core（纯、可单测）；`[view]` = CodeMirror adapter / UI；
`[shell]` = Tauri/Rust 宿主。

---

## 0. 北极星原则（非功能，但决定一切）

| # | 原则 | 状态 |
|---|------|------|
| 0.1 | **Markdown 文本是唯一 source of truth**，无私有存储格式 | ✅ |
| 0.2 | **无损往返**：渲染→编辑→保存不改变未触碰的字节 | ✅ |
| 0.3 | **Obsidian 互操作**：不注入 app 专属字段，不碰 `.obsidian`/`.trash`/`.git` | ✅ `[shell]` |
| 0.4 | **光标揭示（reveal）**：光标进入即显示原始语法，离开即渲染（Typora 手感） | ✅ `[core]` `rangeRevealed` |
| 0.5 | **本地优先**，离线可用 | ✅ |

---

## 1. 行内格式（inline）

| # | 功能 | 渲染 | 编辑命令 | 状态 |
|---|------|------|---------|------|
| 1.1 | 粗体 `**` | ✅ | ✅ `[core]` `toggleInlineMark('bold')` ⌘B | ✅ |
| 1.2 | 斜体 `*` | ✅ | ✅ ⌘I | ✅ |
| 1.3 | 删除线 `~~` | ✅ | ✅ ⌘⇧X | ✅ |
| 1.4 | 行内代码 `` ` `` | ✅ | ✅ ⌘E | ✅ |
| 1.5 | 高亮 `==` | ✅ | ✅ ⌘⇧H | ✅ |
| 1.6 | 行内公式 `$…$` | ✅ KaTeX | ⬜ 无插入命令 | 🟡 |
| 1.7 | 链接 `[t](url)` | ✅ + 图标 | ✅ `[core]` `wrapLink` ⌘⇧K | ✅ |
| 1.8 | Wiki 链接 `[[…]]` | ✅ badge + 跳转 | ⬜ 无插入/补全命令 | 🟡 |
| 1.9 | 脚注 `[^1]` | ✅ hover 预览 | ⬜ 无插入命令 | 🟡 |
| 1.10 | 清除行内格式 | — | ⬜ | ⬜ |

---

## 2. 块级结构（block）

| # | 功能 | 渲染 | 编辑命令 | 状态 |
|---|------|------|---------|------|
| 2.1 | 标题 H1–H6 | ✅ | ✅ `[core]` `setHeading` ⌘⌥1–6 / ⌘⌥0 | ✅ |
| 2.2 | 无序列表 | ✅ bullet widget | ✅ `[core]` `toggleBulletList` ⌘⇧8 | ✅ |
| 2.3 | 有序列表 | ✅ number widget | ✅ `[core]` `toggleOrderedList` ⌘⇧7 | ✅ |
| 2.4 | 任务列表 | ✅ 可点 checkbox | ✅ `[core]` `toggleTaskList` ⌘⇧9 + `toggleTaskOnLine` | ✅ |
| 2.5 | 列表自动延续（Enter） | — | ✅ `[core]` `listEnterAction` | ✅ |
| 2.6 | 列表缩进 / 反缩进（Tab） | — | ✅ `[core]` `indent/outdentListLine` | ✅ |
| 2.7 | 引用块 `>` | ✅ | ✅ `[core]` `toggleBlockquote` ⌘⇧. | ✅ |
| 2.8 | 围栏代码块 | ✅ 高亮 widget | 🟡 slash 插入；无语言切换 UI | 🟡 |
| 2.9 | 表格 | ✅ 交互 widget | ✅ `[core]` row/col/align/create；🟡 列操作未接 UI | 🟡 |
| 2.10 | 分隔线 `---` | ✅ | 🟡 仅 slash 插入 | 🟡 |
| 2.11 | Callout `> [!note]` | ✅ 彩色框 + 折叠 | ⬜ 无 toggle 命令 | 🟡 |
| 2.12 | Frontmatter (YAML) | ✅ Properties 面板 | ⬜ 无类型化编辑（date/bool/list） | 🟡 |

---

## 3. 富内容（rich content）

| # | 功能 | 状态 |
|---|------|------|
| 3.1 | 数学公式 `$…$` / `$$…$$`（KaTeX） | ✅ |
| 3.2 | Mermaid 图表 | ✅ |
| 3.3 | PlantUML / Graphviz（Kroki/远程） | ✅ |
| 3.4 | 图片渲染 + 尺寸控制 `![alt|500]` | ✅ |
| 3.5 | 图片拖拽/粘贴入库（`assets/`，冲突重命名） | ✅ `[view]`+`[shell]` |
| 3.6 | 图片预览浮层（缩放/拖拽） | ✅ |
| 3.7 | 视频 / 音频嵌入 | ✅ |
| 3.8 | HTML 内联块 | ⬜ |

---

## 4. 链接、导航与结构

| # | 功能 | 状态 |
|---|------|------|
| 4.1 | ⌘Click 打开链接 / Wiki 跳转 | ✅ `[view]` `linkUrlAt` |
| 4.2 | 文档大纲（outline drawer，跳转到行） | ✅ |
| 4.3 | 反向链接面板 | ✅（🟡 缺上下文摘录） |
| 4.4 | 全文搜索 / 文件名搜索（⌘K） | ✅ `[shell]` |
| 4.5 | 文档内查找 / 替换 | ⬜ |
| 4.6 | 知识图谱（局部 / 全局） | ⬜ |
| 4.7 | 标签 `#tag` 解析 / 面板 / 补全 | ⬜ |

---

## 5. 编辑操作与命令系统

| # | 功能 | 状态 |
|---|------|------|
| 5.1 | 斜杠菜单 `/` 快速插入（IME-safe） | ✅ `[core]` `slashInsertedAt` + `[view]` |
| 5.2 | 行内/块级 toggle 命令（见 §1–2） | ✅ `[core]` |
| 5.3 | 上移 / 下移行 ⌥↑ / ⌥↓ | ✅ `[core]` `moveLines` |
| 5.4 | 复制行 ⇧⌥↓ | ✅ `[core]` `duplicateLines` |
| 5.5 | 智能成对符号自动闭合（`()` `[]` `**`） | ⬜ |
| 5.6 | 智能粘贴（URL→链接、表格、富文本→md） | 🟡 仅图片粘贴 |
| 5.7 | 拖拽重排（列表项 / 块） | ⬜ |
| 5.8 | 命令面板（统一命令入口） | 🟡 registry + 命令目录就绪 `[core]`，⌘P 面板 UI 待建 |
| 5.9 | 命令注册表驱动 菜单/快捷键/slash/插件 | ✅ `[core]` `core/commands` `CommandRegistry`（P0.3） |

---

## 6. 选区、撤销与会话

| # | 功能 | 状态 |
|---|------|------|
| 6.1 | 撤销 / 重做 + 历史 | ✅ `[view]` CM history |
| 6.2 | 多光标 / 块选区 | ✅（CM 默认）|
| 6.3 | ⌘S 保存 + 800ms 防抖自动保存 | ✅ |
| 6.4 | 崩溃恢复草稿 | ✅ `[shell]` |
| 6.5 | 外部变更冲突检测（keep mine / take disk） | ✅ |
| 6.6 | 多标签 / 多窗口 / 多 vault | ✅ |

---

## 7. 输入、可访问性、平台

| # | 功能 | 状态 |
|---|------|------|
| 7.1 | IME（中日韩）输入安全 | ✅ |
| 7.2 | 自动换行 + 可读栏宽 | ✅（🟡 栏宽不可调） |
| 7.3 | 键盘全可达 / ARIA / 屏幕阅读器 | ⬜ |
| 7.4 | 主题（light/dark/auto，跟随系统） | ✅ |
| 7.5 | 字体 / 行距 / 段距 可调 | 🟡 仅内置字体 |
| 7.6 | Windows / Linux 支持 | ⬜ |

---

## 8. 性能与质量

| # | 功能 | 状态 |
|---|------|------|
| 8.1 | 大文件（>10k 行）增量解析，不全文重算 | 🟡 待优化 |
| 8.2 | 大 vault（>10k 文件）增量扫描 / 虚拟滚动 | 🟡 |
| 8.3 | 富内容块渲染失败隔离（不连坐） | ✅ fallback |
| 8.4 | 错误边界（编辑器崩溃不影响侧栏） | ⬜ |
| 8.5 | 单元 / DOM / E2E 测试 | 🟡 73 文件 454 用例，E2E 缺 |

---

## 9. editor-core 命令矩阵（本轮补全产物）

editor-core 现已覆盖 WYSIWYG 编辑的**纯命令层**，全部无 DOM 可单测：

| 类别 | 命令 | 文件 |
|------|------|------|
| 行内 | `toggleInlineMark`（5 种标记）、`wrapLink` | `commands/inlineMark.ts`、`link.ts` |
| 块级 | `setHeading`、`toggleBlockquote`、`toggleBulletList`、`toggleOrderedList`、`toggleTaskList` | `commands/block.ts` |
| 任务 | `toggleTaskOnLine`、`isTaskLine` | `commands/checkbox.ts` |
| 列表 | `listEnterAction`、`indentListLine`、`outdentListLine`、`parseListLine` | `commands/list.ts` |
| 行操作 | `moveLines`、`duplicateLines` | `commands/lines.ts` |
| 表格 | `insert/deleteTableRow`、`insert/deleteTableColumn`、`setColumnAlign`、`createTable`、`parse/serializeTable` | `commands/table.ts` |
| 投影 | `collectDecorations`、`frontmatterEnd`、`rangeRevealed` | `projection.ts` |

契约：命令接收 `EditDoc {text, selection}`，返回偏移量 `EditResult {changes, selection}`，由
`editor/commands/applyEdit.ts` 适配为 CM transaction。键位绑定在 `editor/commands/{inlineMark,block}Keymap.ts`。

### 后续缺口（→ ROADMAP）

- 行内公式 / wiki / 脚注 / callout / HR 的**插入命令**（目前靠 slash 文本片段）。
- 表格列操作 / 对齐切换的 **UI 入口**（命令已就绪，未接 widget 工具条）。
- frontmatter 类型化编辑；文档内查找替换；成对符号自动闭合；智能粘贴。
- `collectDecorations` 输入从 CM `EditorState` 收敛为 `{text, tree, selection}`。
- command registry（统一菜单/快捷键/slash/插件命令）→ 见 ROADMAP P0.3。

---

## 10. 优先级建议（产品视角）

1. **P0 手感闭环**：成对符号自动闭合、文档内查找替换、智能粘贴（URL/表格）—— 直接影响每分钟手感。
2. **P0 命令入口**：把已就绪的 editor-core 命令接到 slash 菜单 + 工具条 + 命令面板（registry）。
3. **P1 结构化编辑**：表格列工具条、callout/HR 插入命令、frontmatter 类型化。
4. **P1 性能**：大文件增量 decoration，保证 §8.1。
5. **P2 关联与可达性**：查找替换、图谱、标签、无障碍。
