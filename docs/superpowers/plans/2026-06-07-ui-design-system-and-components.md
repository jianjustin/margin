# UI 设计系统统一 + 四大组件优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将 Margin 的 UI 对齐设计稿 `docs/design/Margin (standalone).html`，建立统一设计语言规范，并优化文件树、Markdown 所见即所得编辑器、编辑器 "/" 快捷输入、右侧标题导航四个核心组件。

**架构:** 以设计稿 CSS 为单一事实来源，提取所有色彩/字体/间距/交互规范为 `DESIGN_SYSTEM.md` 文档。UI 层通过 CSS 自定义属性 (`tokens.css`) + Tailwind 映射实现主题切换。新组件 (OutlineDrawer, SlashMenu) 为独立 React 组件，通过 App.tsx 的 state + ref 与编辑器通信。

**技术栈:** Electron 33 · React 18 · CodeMirror 6 · Zustand 5 · Tailwind CSS 3 · oklch 色彩空间

---

## 已完成的文件结构

### 新建文件

| 文件路径 | 职责 |
|---------|------|
| `docs/design/DESIGN_SYSTEM.md` | 统一 UI 设计语言规范文档（色彩、字体、间距、组件、交互） |
| `src/renderer/src/components/OutlineDrawer.tsx` | 右侧标题大纲抽屉组件 |
| `src/renderer/src/components/SlashMenu.tsx` | 编辑器 "/" 快捷块插入菜单组件 |

### 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `src/renderer/src/theme/tokens.css` | 新增 `--r`、`--sidebar-w`、`--drawer-w`、交通灯色彩变量 |
| `src/renderer/src/index.css` | 新增 `slash-in`/`blk-flash` 动画、滚动条样式 |
| `src/renderer/src/components/FileTree/Sidebar.tsx` | 品牌标记 + 搜索栏 + 分区标题 + 文件树过滤 |
| `src/renderer/src/components/FileTree/FileTree.tsx` | 支持 `filteredTree` 属性和全展开模式 |
| `src/renderer/src/components/FileTree/FileTreeRow.tsx` | 文件类型图标着色 + 文件夹子项计数 |
| `src/renderer/src/lib/flattenTree.ts` | `expanded` 参数支持 `'all'` 值 |
| `src/renderer/src/components/Editor.tsx` | `forwardRef` + `jumpToLine` + Slash 菜单集成 |
| `src/renderer/src/editor/livePreview/theme.ts` | 标题字重 680/650/640、行内代码 accent 色+边框 |
| `src/renderer/src/components/StatusBar.tsx` | 上下文标记 "◆ 正文" + 独立统计项布局 |
| `src/renderer/src/components/ThemeToggle.tsx` | 统一工具栏按钮尺寸和过渡动画 |
| `src/renderer/src/App.tsx` | 大纲抽屉开关 + ⌘B/⌘\ 快捷键 + 工具栏活跃态 |
| `test/statusBar-dom.test.tsx` | 适配新 StatusBar 布局的断言 |

---

## 任务 1：输出统一 UI 设计语言规范 ✅

**文件：**
- 新建：`docs/design/DESIGN_SYSTEM.md`

**方案说明：** 从设计稿 HTML 的 CSS 中提取所有设计决策，按色彩体系、字体体系、间距与尺寸、组件规范（标题栏/侧栏/编辑器/状态栏/大纲抽屉/Slash 菜单）、交互规范五大板块组织。文档作为后续所有 UI 开发的单一参考来源。

- [x] **步骤 1：提取设计稿 CSS**
  从 `docs/design/Margin (standalone).html` 的第四个 `<script>` 块中提取转义的 CSS，包含 `:root` 变量、组件类名、动画定义。

- [x] **步骤 2：编写规范文档**
  按六大板块编写：色彩体系（暗/亮双主题 + 语法高亮色）、字体体系（三套字体栈 + 14 种场景字号）、间距与尺寸（全局常量 + 圆角规范 + 工具栏按钮）、组件规范（6 个组件详细定义）、交互规范（9 种过渡动画 + 滚动条 + 快捷键 + 交互模式）、布局结构（ASCII 图 + Grid 定义）。

- [x] **步骤 3：验证完整性**
  对照设计稿 CSS 中的所有选择器，确认规范文档未遗漏任何组件或交互定义。

---

## 任务 2：更新设计令牌 ✅

**文件：**
- 修改：`src/renderer/src/theme/tokens.css`

**方案说明：** 设计稿定义了当前 `tokens.css` 中缺失的几个关键变量：默认圆角 `--r: 7px`、侧栏/抽屉宽度、macOS 交通灯色。这些变量被后续组件通过 `var(--r)` 等方式引用。

- [x] **步骤 1：新增变量**

```css
--tl-red: #ff5f57;
--tl-yellow: #febc2e;
--tl-green: #28c840;
--r: 7px;
--sidebar-w: 244px;
--drawer-w: 296px;
```

- [x] **步骤 2：构建验证**
  运行 `npm run build` 确认无报错。

---

## 任务 3：优化文件树侧栏 ✅

**文件：**
- 修改：`src/renderer/src/components/FileTree/Sidebar.tsx`
- 修改：`src/renderer/src/components/FileTree/FileTree.tsx`
- 修改：`src/renderer/src/components/FileTree/FileTreeRow.tsx`
- 修改：`src/renderer/src/lib/flattenTree.ts`

**方案说明：**

1. **品牌标记**：侧栏头部从简单的 vault 文件夹名 + FolderOpen 图标，改为设计稿的品牌布局 — 22px 金色圆角方块内嵌衬线斜体 "M" + 粗体 "Margin" 标题 + "+" 新建按钮。

2. **搜索栏**：在品牌下方新增搜索输入框，背景 `--bg`，边框 `--border-soft`，内含 Search 图标。输入时通过递归 `filterTree()` 函数过滤文件树（保留匹配文件及其父级文件夹），并自动展开所有文件夹。

3. **分区标题**：在文件树上方添加 "文件库" 大写分区标题，`10.5px`，`letter-spacing: .08em`。

4. **文件类型图标**：替换 lucide 的通用 FileText/Folder 图标为基于文件扩展名的等宽文本标签：md → "M"（accent 色）、json → "{ }"（faint）、canvas → "◇"（蓝色）等。文件夹使用 "▸" 符号。

5. **子项计数**：文件夹行末尾显示子项数量，默认 `opacity: 0`，悬停时 `opacity: 0.8`（通过 Tailwind `group-hover` 实现）。

6. **flattenTree 扩展**：`expanded` 参数支持字面量 `'all'`，搜索结果时自动展开所有层级。

- [x] **步骤 1：实现 `filterTree` 递归过滤**
- [x] **步骤 2：重写 Sidebar 布局（品牌 + 搜索 + 分区标题）**
- [x] **步骤 3：FileTree 接收 `filteredTree` 属性**
- [x] **步骤 4：FileTreeRow 文件类型图标 + 子项计数**
- [x] **步骤 5：flattenTree 支持 `'all'` 展开模式**

---

## 任务 4：实现右侧标题大纲抽屉 ✅

**文件：**
- 新建：`src/renderer/src/components/OutlineDrawer.tsx`
- 修改：`src/renderer/src/App.tsx`

**方案说明：**

1. **标题解析**：使用 `useMemo` 在每次文档内容变更时通过正则 `/^(#{1,3})\s+(.+)/` 提取 H1-H3 标题。解析器跳过 YAML frontmatter（`---` 围栏内的内容）和代码块（`` ``` `` 围栏内的内容），避免误识别。

2. **UI 布局**：宽度 `296px`（`var(--drawer-w)`），背景 `--bg-panel`，左边框 `--border-soft`。头部显示 "大纲" + "点击跳转" 提示。

3. **层级缩进**：H1 无缩进 + 粗体 + `--text` 色，H2 `padding-left: 21px`，H3 `padding-left: 36px` + `12px` 字号。每行左侧有 2px 竖线指示器（H1 高 15px，H2/H3 高 13px），默认 `--border` 色，活跃时 `--accent` 色。

4. **跳转交互**：点击标题行 → 调用 `onJumpToLine(line)` → Editor 通过 `useImperativeHandle` 暴露的 `jumpToLine` 方法执行 `view.dispatch({ selection, effects: scrollIntoView })` → 滚动到目标标题并聚焦。活跃态保持 2000ms 后自动清除。

5. **空状态**：无标题时显示居中提示 "暂无标题" + 代码示例 `` `# 标题` ``。

6. **App 集成**：通过 `drawerOpen` state 控制显隐，⌘\ 快捷键切换，工具栏按钮（AlignLeft 图标）显示活跃态。

- [x] **步骤 1：实现 `parseHeadings` 解析函数**
- [x] **步骤 2：实现 OutlineDrawer 组件 UI**
- [x] **步骤 3：Editor 通过 `forwardRef` + `useImperativeHandle` 暴露 `jumpToLine`**
- [x] **步骤 4：App.tsx 集成抽屉开关 + ⌘\ 快捷键**

---

## 任务 5：实现编辑器 "/" 快捷块插入菜单 ✅

**文件：**
- 新建：`src/renderer/src/components/SlashMenu.tsx`
- 修改：`src/renderer/src/components/Editor.tsx`
- 修改：`src/renderer/src/index.css`

**方案说明：**

1. **触发条件**：在 CodeMirror 中注册 `/` 键的 keymap 处理器。当光标所在行在 `/` 之前只有空白字符时，触发菜单显示。使用 `coordsAtPos()` 获取屏幕坐标定位菜单。

2. **菜单内容**：10 种块类型 — H1/H2/H3、无序列表、有序列表、待办事项、引用、代码块、分隔线、表格。每项包含图标（等宽字符）、名称、描述、快捷键提示。

3. **交互行为**：
   - 键盘导航：↑↓ 切换活跃项，Enter 确认插入，Esc 关闭
   - 搜索过滤：直接打字过滤菜单项（按名称或 ID 匹配）
   - Backspace：过滤文字为空时关闭菜单
   - 鼠标：悬停高亮 + 点击选择

4. **插入逻辑**：选中菜单项后，将 `[from-1, to)` 范围（包含触发的 `/` 字符）替换为对应 markdown 语法文本，光标置于末尾。

5. **视觉设计**：宽度 `292px`，圆角 `10px`，背景 `--bg-elev`，`0.12s` 入场动画（`translateY(-4px) scale(0.99)` → normal），底部键盘提示栏。

- [x] **步骤 1：定义 SlashMenuItem 数据结构和菜单项列表**
- [x] **步骤 2：实现 SlashMenu 组件（渲染 + 键盘交互 + 搜索过滤）**
- [x] **步骤 3：Editor.tsx 注册 `/` keymap + 菜单坐标计算**
- [x] **步骤 4：index.css 新增 `@keyframes slash-in` 动画**

---

## 任务 6：精炼编辑器 WYSIWYG 样式 ✅

**文件：**
- 修改：`src/renderer/src/editor/livePreview/theme.ts`
- 修改：`src/renderer/src/components/StatusBar.tsx`
- 修改：`src/renderer/src/components/ThemeToggle.tsx`
- 修改：`src/renderer/src/index.css`
- 修改：`test/statusBar-dom.test.tsx`

**方案说明：**

1. **标题字重对齐**：H1 `680`（从 600）、H2 `650`、H3 `640`，添加 `margin-top` 和 `letter-spacing`，匹配设计稿的视觉层次。

2. **行内代码升级**：新增 `color: var(--accent)` 和 `border: 1px solid var(--border-soft)`，从纯背景色变为带边框+强调色的醒目样式。`padding` 从 `0.1em 0.3em` 调整为 `1px 5px`。

3. **引用块优化**：竖线从 `var(--accent)` 实色改为 `var(--accent-line)`（32% 透明度），文字新增 `font-style: italic`。

4. **链接样式**：从 `text-decoration: underline` 改为 `border-bottom: 1px solid var(--accent-line)` + `text-decoration: none`，更精致的下划线效果。

5. **粗体字重**：从 `700` 调整为 `680`，与标题体系一致。

6. **状态栏重构**：左侧新增上下文标记 "◆ 正文"（`::before` 伪元素实现钻石符号），统计项从单行合并改为独立 `<span>` 元素，移除 "块" 计数。

7. **滚动条样式**：新增全局 `::-webkit-scrollbar` 定义，11px 宽，拇指 3px 透明边框 + 8px 圆角。

8. **测试修复**：更新 `statusBar-dom.test.tsx` 断言适配新布局（独立统计项 + 上下文标记）。

- [x] **步骤 1：更新 `marginEditorTheme` 对象**
- [x] **步骤 2：重写 StatusBar 布局**
- [x] **步骤 3：统一 ThemeToggle 按钮尺寸**
- [x] **步骤 4：新增滚动条和动画 CSS**
- [x] **步骤 5：修复 StatusBar 测试**
- [x] **步骤 6：全量测试通过（111/111）+ 构建通过**

---

## 任务 7：App 品牌化 — Margin 命名 + Dock 图标 ✅

**文件：**
- 修改：`src/main/index.ts`
- 修改/生成：`build/icon.png`
- 新建：`build/icon-square.svg`
- 新建：`docs/design/APP_ICON.md`

**方案说明：**

1. **应用命名**：在主进程顶层调用 `app.setName('Margin')`，确保所有系统 API 返回正确的应用名。`package.json` 中 `productName: "Margin"` 已配置，打包后生效。

2. **自定义 macOS 菜单**：使用 `Menu.buildFromTemplate()` 替换默认 Electron 菜单，第一项 label 为 `"Margin"`，子菜单项包含 "关于 Margin"、"隐藏 Margin"、"退出 Margin"。开发模式下菜单栏标题受限于 Electron 可执行文件 `CFBundleName`，打包后正确显示。

3. **Dock 图标生成流程**（详见 `docs/design/APP_ICON.md`）：
   - SVG 源文件：`build/icon-square.svg`，squircle `x=50, y=50, w=924, h=924, rx=207`，四周 50px 透明边距对齐系统图标大小
   - 步骤 1：`qlmanage -t -s 1024 -o /tmp build/icon-square.svg` 渲染为 PNG
   - 步骤 2：Python 脚本解码 PNG 像素、将 squircle 外像素 alpha 清零、重新编码写入 `build/icon.png`
   - **必须两步**：qlmanage 将圆角外区域渲染为不透明白色；`app.dock.setIcon()` 直接显示 PNG，不自动应用 macOS squircle 遮罩

4. **全局 Electron → Margin 检查**：确认所有用户可见字符串中无残留 "Electron" 字样；框架级引用（`import from 'electron'`、类型断言）保留。

- [x] **步骤 1：`app.setName('Margin')` + `app.dock.setIcon()`**
- [x] **步骤 2：自定义 macOS 应用菜单（Menu.buildFromTemplate）**
- [x] **步骤 3：创建 `build/icon-square.svg`（无圆角原始稿）**
- [x] **步骤 4：qlmanage 渲染 SVG → PNG**
- [x] **步骤 5：Python 脚本修复 PNG 透明度（squircle 外 alpha=0）**
- [x] **步骤 6：调整 squircle 字号 460 + 50px 边距，对齐系统图标大小**
- [x] **步骤 7：编写 `docs/design/APP_ICON.md` 图标约束文档**

---

## 后续优化方向（未在本轮实施）

以下为设计稿中存在但本轮未实施的高级功能，可作为后续任务：

1. **设置面板**：完整的设置覆盖层（主题选择、编辑器字体/字号/行高滑块、忽略列表管理、关于页）
2. **代码块语言栏**：代码块顶部显示语言标签 + 复制按钮
3. **标注框 (Callout)**：`> [!note]` 风格的高亮框
4. **图片占位符**：拖放或点击上传图片的虚线框
5. **表格编辑**：可交互的 markdown 表格编辑器
6. **大纲滚动同步**：编辑器滚动时自动高亮当前可见的标题
7. **文件树拖拽排序**：拖放调整文件/文件夹位置
8. **侧栏文件搜索**：全文搜索（当前仅按文件名过滤）
