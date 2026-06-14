# Margin — Roadmap

> 最后更新：2026-06-14

---

## 已完成里程碑

| 里程碑 | 描述 | 状态 |
|--------|------|------|
| M0 + M1 | 单文件编辑器 · 打开/保存/自动保存 | ✅ 完成 |
| M2 | Live Preview · 富文本块（代码/表格/frontmatter） | ✅ 完成 |
| M3 | 主题 · 排版系统 | ✅ 完成 |
| M4 | 文件树 · 日程侧边栏 | ✅ 完成 |
| M5 | 标题栏 · 状态栏 | ✅ 完成 |
| M6 | 自动更新器（Tauri） | ✅ 完成 |
| M7 | 编辑体验打磨（搜索浮层 · Tab 缩进 · Wiki 链接 · 表格增强 · 移动对话框） | ✅ 完成 |

---

## M8 — 富内容块扩展（近期）

### 8.1 代码块 — 图表渲染
将特定语言的代码块渲染为可视化图形，保持"光标进入即回到源码"的 Live Preview 交互模式。

| 语言标识 | 渲染引擎 | 优先级 |
|----------|----------|--------|
| `mermaid` | [Mermaid.js](https://mermaid.js.org/) | 高 |
| `plantuml` | PlantUML Server / kroki.io | 高 |
| `math` / `latex` | KaTeX | 中 |
| `d2` | D2 (via kroki) | 低 |
| `graphviz` / `dot` | Viz.js / kroki | 低 |

实现思路：
1. 在 CM6 `StateField` 中检测 fenced code block 语言标识
2. 匹配到支持的图表语言时，渲染为 `WidgetType`（同现有代码块方案）
3. 光标进入块时 widget 隐藏，显示原始 Markdown 源码
4. 渲染失败时 fallback 显示原始代码块 + 错误提示

### 8.2 数学公式
- 行内公式 `$...$` 和块级公式 `$$...$$` 使用 KaTeX 渲染
- 渲染错误时原样显示源码

### 8.3 嵌入图片增强
- 本地图片拖拽粘贴自动复制到 vault assets 目录
- 图片宽度可通过 `![[image.png|500]]` 语法控制

---

## M9 — 插件化架构（长期）

目标：将可选功能从核心剥离，以插件形式按需加载，降低核心包体积。

### 9.1 插件系统设计
- 定义插件接口：`{ id, name, activate(ctx), deactivate() }`
- 插件可注册：CM6 扩展、工具栏按钮、侧边栏面板、快捷键
- 插件在主进程侧加载，通过 IPC 与渲染层通信

### 9.2 内置插件候选
| 插件 | 功能 |
|------|------|
| `plugin-mermaid` | Mermaid 图表渲染 |
| `plugin-plantuml` | PlantUML 图表渲染 |
| `plugin-math` | KaTeX 数学公式 |
| `plugin-calendar` | 日历视图侧边栏 |
| `plugin-outline` | 文档大纲面板 |
| `plugin-backlinks` | 反向链接面板 |
| `plugin-templates` | 模板插入 |

### 9.3 插件管理 UI
- 设置页展示已安装/可用插件列表
- 支持启用/禁用、查看插件信息

---

## M10 — 协作与发布（长期）

- 导出：PDF / HTML / DOCX
- 版本历史：基于 git 的文件快照浏览
- 多窗口支持
- 移动端伴侣 App（iOS）

---

## 技术债务 & 持续改进

- [ ] 完善 Vitest 单元测试覆盖率（CM6 扩展、IPC handler）
- [ ] 性能：超长文档（>10k 行）的 CM6 viewport 渲染优化
- [ ] 无障碍：键盘导航、ARIA 标注
- [ ] Windows / Linux 适配验证
