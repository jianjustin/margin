# Margin — Backlog

> 最后更新：2026-06-19
> 当前版本：v2.3.0

优先级：🔴 高 / 🟡 中 / 🟢 低

---

## 当前版本：v2.4 — 富内容扩展 （开发中）

### 🔴 Mermaid 图表渲染

- **目标**：`mermaid` 代码块渲染为 SVG 图表，光标进入还原源码
- **实现**：CM6 `StateField` → `WidgetType`，复用现有代码块 widget 方案
- **渲染引擎**：mermaid.js（bundle 到前端，需控制体积）
- **边缘情况**：渲染失败 fallback 原始代码块 + 错误提示；超大图表 overflow scroll
- **文件**：`src/renderer/src/editor/livePreview/` 新增 `mermaid.ts`
- **参考**：现有 `codeBlock.ts` widget 实现

### 🟡 PlantUML 图表渲染

- **目标**：`plantuml` 代码块渲染为图形
- **方案**：默认使用 PlantUML Server 远程渲染，支持配置自建 Kroki 地址
- **缓存**：按源码 hash 缓存 SVG，避免重复网络请求
- **离线降级**：无网络时显示「需要网络」占位
- **安全**：源码上传到远程服务器，需用户确认首次使用

### 🟡 KaTeX 数学公式

- **目标**：`$...$` 行内 + `$$...$$` 块级公式渲染
- **实现**：CM6 `ViewPlugin` + KaTeX bundle
- **限制**：仅支持 KaTeX 支持的 LaTeX 子集（不依赖 MathJax 的庞大体积）
- **文件**：`src/renderer/src/editor/livePreview/` 新增 `math.ts`

### 🟡 图片拖拽粘贴

- **目标**：拖入/粘贴图片自动复制到 vault `assets/` 目录并插入链接
- **实现**：CM6 `EditorView.dom` 监听 drop/paste 事件 → IPC 写入文件 → 插入 `![]()` 语法
- **配置**：目标目录可配置（默认 `assets/`）
- **冲突**：文件名重复时自动追加 `-1` `-2` 后缀

### 🟡 Callout / Admonition

- **目标**：Obsidian 风格 `> [!note]` 等 callout 区块渲染为彩色提示框
- **内置类型**：note, warning, danger, tip, info, quote
- **折叠语法**：`> [!note]-` 默认折叠
- **实现**：CM6 `StateField` 匹配 `> [!type]` 语法 → 渲染为 styled widget

### 🟢 高亮语法

- **目标**：`==highlight==` 渲染为黄色高亮背景
- **实现**：CM6 Markdown 扩展，注册自定义行内标记

### 🟢 图片尺寸控制

- **目标**：`![alt|500](image.png)` 或 pipeline 语法控制显示宽度
- **实现**：解析 pipeline 尺寸参数 → 设置 widget 宽度

### 🟢 D2 / Graphviz 图表

- **目标**：`d2` `dot` 代码块渲染
- **方案**：通过 Kroki 统一渲染，不单独 bundle 渲染引擎
- **优先级低**：先完成 Mermaid + PlantUML + KaTeX

---

## v2.5 — 知识图谱 （计划中）

### 🔴 局部图谱

- **目标**：当前文档出入链可视化，节点=笔记，边=链接
- **渲染**：Canvas 2D / D3-force / Cytoscape.js（评估后选择）
- **交互**：缩放拖拽、hover 标题、点击跳转
- **文件**：新建 `src/renderer/src/components/GraphView/`

### 🔴 反向链接上下文

- **目标**：反向链接面板显示包含链接的段落摘录
- **实现**：读取源文件 → 提取链接所在行 ±2 行上下文

### 🟡 全局图谱

- **目标**：vault 级别全量笔记关联网络
- **性能挑战**：>5000 节点时需降精度渲染或聚合

### 🟡 标签系统

- **目标**：`#tag` 和 frontmatter `tags:` 解析、面板、自动补全、嵌套标签
- **文件**：新建 `src/renderer/src/components/TagPane/`

### 🟡 未链接提及

- **目标**：检测正文中出现的其他笔记标题，提示建立链接

### 🟢 Frontmatter 类型化编辑

- **目标**：日期 date picker、列表 tag input、布尔 toggle、别名支持

---

## v2.6 — 品质 · 性能 · 平台 （计划中）

### 🔴 大文件性能优化

- **目标**：>10k 行 Markdown 文件编辑流畅 (<16ms per frame)
- **方向**：CodeMirror viewport 调优、decoration 增量更新、按需解析

### 🔴 测试覆盖率

- **目标**：>80% 覆盖率
- **重点**：CM6 扩展、IPC handler、Zustand store、富内容 widget

### 🔴 E2E 测试

- **目标**：Playwright + Tauri 集成测试完整编辑流程

### 🟡 Windows 适配

- **路径**：反斜杠/盘符/大小写不敏感
- **通知**：文件监听 API 差异
- **打包**：MSIX / NSIS

### 🟡 无障碍

- **键盘导航**：面板间 Tab 焦点切换
- **ARIA**：文件树、标签页、编辑器区域标注
- **屏幕阅读器**：VoiceOver / NVDA 兼容

### 🟡 大 vault 扫描优化

- **增量缓存**：仅扫描变更子树
- **文件树虚拟滚动**

### 🟢 Linux 适配

- **打包**：AppImage / deb
- **Wayland**：兼容性测试

---

## v2.7+ — 远期规划

详见 [ROADMAP.md](ROADMAP.md) 对应章节：

- **v2.7** — 导出 (PDF/HTML)、模板系统、自定义主题
- **v2.8** — 插件架构、API 设计、内置功能插件化
- **v3.0** — Git 版本历史、云同步、iOS 伴侣 App、静态站点发布

---

## 持续跟踪（跨版本）

- [ ] **性能回归测试** — 建立 large vault (10k files) + large file (10k lines) benchmark
- [ ] **i18n 框架** — 统一翻译方案（目前中英混杂）
- [ ] **用户文档** — 功能说明和快捷键一览
- [ ] **错误上报** — 本地崩溃日志 + 可选匿名遥测
- [ ] **CI/CD** — 多平台自动构建 + 测试 + 发布
- [ ] **依赖升级** — Tauri / React / CodeMirror 主版本升级
