# Margin Design System

Margin 的统一 UI 样式与交互语言规范。所有组件、颜色、字体、间距、交互行为均以此文档为准。

---

## 1. 色彩体系 (Color Tokens)

所有颜色使用 oklch 色彩空间，通过 CSS 自定义属性定义，暗色为默认主题。

### 暗色主题 (default)

| Token          | 值                              | 用途               |
| -------------- | ------------------------------- | ------------------ |
| `--bg`         | `oklch(0.165 0.006 70)`        | 全局背景           |
| `--bg-panel`   | `oklch(0.205 0.006 70)`        | 面板背景（侧栏、状态栏、抽屉）|
| `--bg-elev`    | `oklch(0.245 0.007 70)`        | 抬升背景（代码块、输入框）    |
| `--bg-hover`   | `oklch(0.275 0.008 70)`        | 悬停态背景         |
| `--border`     | `oklch(0.305 0.006 70)`        | 标准边框           |
| `--border-soft`| `oklch(0.255 0.006 70)`        | 柔和边框（面板分隔线）       |
| `--text`       | `oklch(0.905 0.01 85)`         | 主文本             |
| `--text-dim`   | `oklch(0.66 0.01 80)`          | 次要文本           |
| `--text-faint` | `oklch(0.49 0.01 80)`          | 弱化文本（占位符、提示）     |
| `--accent`     | `oklch(0.82 0.11 90)`          | 强调色（金色）     |
| `--accent-ink` | `oklch(0.30 0.05 80)`          | 强调色上的文字     |
| `--accent-soft`| `oklch(0.82 0.11 90 / 0.14)`   | 强调色浅底（选中态背景）    |
| `--accent-line`| `oklch(0.82 0.11 90 / 0.32)`   | 强调色边框         |
| `--sel`        | `oklch(0.82 0.11 90 / 0.20)`   | 文本选区           |
| `--red`        | `oklch(0.62 0.18 25)`          | 错误/删除          |

### 亮色主题 `[data-theme="light"]`

| Token          | 值                              |
| -------------- | ------------------------------- |
| `--bg`         | `oklch(0.975 0.005 85)`        |
| `--bg-panel`   | `oklch(0.945 0.007 85)`        |
| `--bg-elev`    | `oklch(0.995 0.003 85)`        |
| `--bg-hover`   | `oklch(0.915 0.009 85)`        |
| `--border`     | `oklch(0.875 0.008 85)`        |
| `--border-soft`| `oklch(0.915 0.007 85)`        |
| `--text`       | `oklch(0.265 0.012 75)`        |
| `--text-dim`   | `oklch(0.46 0.012 75)`         |
| `--text-faint` | `oklch(0.64 0.012 75)`         |
| `--accent`     | `oklch(0.60 0.12 70)`          |
| `--accent-ink` | `oklch(0.99 0.02 90)`          |
| `--accent-soft`| `oklch(0.60 0.12 70 / 0.12)`   |
| `--accent-line`| `oklch(0.60 0.12 70 / 0.30)`   |
| `--sel`        | `oklch(0.60 0.12 70 / 0.18)`   |

### 语法高亮色 (代码块)

| Token / 选择器        | 暗色                       | 亮色                       | 用途        |
| --------------------- | -------------------------- | -------------------------- | ----------- |
| `.hljs-keyword`       | `var(--accent)`            | —                          | 关键字      |
| `.hljs-string`        | `oklch(0.74 0.10 150)`     | `oklch(0.50 0.12 150)`     | 字符串      |
| `.hljs-number`        | `oklch(0.72 0.11 50)`      | `oklch(0.52 0.14 45)`      | 数字        |
| `.hljs-title`         | `oklch(0.75 0.10 240)`     | `oklch(0.50 0.13 250)`     | 函数/类名   |
| `.hljs-title.class_`  | `oklch(0.76 0.10 300)`     | `oklch(0.52 0.13 305)`     | 类名        |
| `.hljs-comment`       | `var(--text-faint)`        | —                          | 注释        |

---

## 2. 字体体系 (Typography)

### 字体栈

| Token     | 字体栈                                                      | 用途        |
| --------- | ----------------------------------------------------------- | ----------- |
| `--ui`    | `"IBM Plex Sans", "PingFang SC", system-ui, sans-serif`     | UI 界面     |
| `--mono`  | `"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace` | 等宽/代码   |
| `--serif` | `"IBM Plex Serif", Georgia, serif`                          | 品牌标记    |

### 字号规范

| 场景            | 字号       | 字重  | 备注                    |
| --------------- | ---------- | ----- | ----------------------- |
| 编辑器正文      | `16px`     | 400   | `line-height: 1.72`    |
| H1              | `1.62em`   | 680   | `line-height: 1.3`    |
| H2              | `1.32em`   | 650   | `line-height: 1.35`   |
| H3              | `1.1em`    | 640   | `line-height: 1.4`    |
| 标题栏文件名    | `12.5px`   | 500   | `letter-spacing: .01em`|
| 侧栏品牌名      | `14px`     | 600   | `letter-spacing: .02em`|
| 侧栏文件树      | `13px`     | 400     | 文件夹与文件统一字重  |
| 侧栏搜索框      | `12.5px`   | 400   |                         |
| 侧栏分区标题    | `10.5px`   | 600   | `letter-spacing: .08em`, 大写 |
| 状态栏          | `11.5px`   | 400   | `font-variant-numeric: tabular-nums` |
| 大纲行          | `12.5px`   | 400/600 | H1 加粗               |
| Slash 菜单项名  | `13px`     | 550   |                         |
| Slash 菜单描述  | `11px`     | 400   | `color: var(--text-faint)` |
| 代码块正文      | `13.5px`   | 400   | `line-height: 1.65`   |
| 行内代码        | `0.88em`   | 400   |                         |

---

## 3. 间距与尺寸 (Spacing & Sizing)

### 全局尺寸

| Token / 常量    | 值       | 用途              |
| --------------- | -------- | ----------------- |
| `--r`           | `7px`    | 默认圆角          |
| `--sidebar-w`   | `244px`  | 侧栏宽度          |
| `--drawer-w`    | `296px`  | 右侧抽屉宽度      |
| 标题栏高度      | `38px`   |                    |
| 状态栏高度      | `28px`   |                    |
| 编辑器最大宽度  | `720px`  | `--editor-width`  |
| 编辑器内边距    | `56px 40px 240px` | 上 左右 下  |

### 圆角规范

| 场景         | 圆角   |
| ------------ | ------ |
| 通用（按钮、文件行、输入框） | `6px`  |
| 代码块、卡片、弹窗边框      | `7px` (`var(--r)`) |
| 设置弹窗     | `12px` |
| Slash 菜单   | `10px` |
| 标签 (tag)   | `20px` |
| 圆形（头像、交通灯）| `50%`  |
| 滚动条       | `8px`  |

### 工具栏按钮

| 属性   | 值          |
| ------ | ----------- |
| 宽度   | `30px`      |
| 高度   | `26px`      |
| 圆角   | `6px`       |
| 图标   | `17×17px`   |

---

## 4. 组件规范

### 4.1 标题栏 (Titlebar)

- 高度 `38px`，背景 `--bg-panel`，底部 `1px solid --border-soft`
- 左侧：macOS 交通灯（12px 圆形，`--tl-red/yellow/green`）
- 中间：面包屑路径（`父目录 / 文件名 ●`），居中对齐
  - 父目录色 `--text-faint`，文件名色 `--text-dim`，脏标记 `--accent`
- 右侧：工具按钮组（sidebar/theme/settings/outline），间距 `2px`
- 整区域 `-webkit-app-region: drag`，按钮除外

### 4.2 侧栏 (Sidebar)

- 宽度 `244px`，背景 `--bg-panel`，右边框 `1px solid --border-soft`
- **头部**：品牌标记（22px 圆角方块，`--accent` 底，衬线斜体 "M"）+ 粗体 "Margin" + 新建按钮（24px，"+"）
- **搜索栏**：`margin: 4px 12px 8px`，背景 `--bg`，边框 `--border-soft`，圆角 `6px`，内边距 `5px 9px`
- **分区标题**：`10.5px`，大写，`letter-spacing: .08em`，`--text-faint`
- **文件树**：
  - 行高 `4px 8px` 内边距，圆角 `6px`，间距 `6px`
  - 左侧缩进基础 `8px`，每级 `14px`（与当前一致）
  - 展开箭头 `12px`，旋转 `90deg`，`transition: .16s ease`
  - 文件图标：按类型着色（md → accent，json → text-faint，canvas → 蓝色）
  - 文件夹图标：`--accent` 色
  - 选中态：`background: --accent-soft`，`border: 1px solid --accent-line`
  - 文件夹悬停时显示子项计数（`opacity: 0` → `0.8`）
  - 忽略文件：`opacity: 0.42`

### 4.3 编辑器 (Editor)

- 背景 `--bg`，内容区 `max-width: 720px`，`margin: 0 auto`
- **正文**：`font-size: 16px`，`line-height: 1.72`，`font-family: var(--ui)`
- **标题**：
  - H1: `1.62em`，`font-weight: 680`，`margin-top: 18px`
  - H2: `1.32em`，`font-weight: 650`，`margin-top: 14px`
  - H3: `1.1em`，`font-weight: 640`，`margin-top: 10px`
- **粗体**：`font-weight: 680`
- **行内代码**：`--mono` 字体，`0.88em`，背景 `--bg-elev`，边框 `1px solid --border-soft`，色 `--accent`，圆角 `4px`，内边距 `1px 5px`
- **引用块**：左侧 `3px` 圆角竖线 `--accent-line`，文字 `--text-dim`，斜体
- **代码块**：
  - 外框：背景 `--bg-elev`，边框 `1px solid --border-soft`，圆角 `var(--r)`
  - 语言栏：底部分隔线，背景稍深（`calc(l - 0.02)`），显示语言名 + 复制按钮
  - 正文：`font-family: --mono`，`13.5px`，`line-height: 1.65`，`padding: 12px 14px`
- **列表**：
  - 缩进 `28px`
  - 无序：`•` 符号，`--accent` 色，`18px`
  - 有序：数字 + `.`，`--accent` 色，`tabular-nums`，`font-weight: 550`
  - 待办：自定义复选框 `17×17px`，圆角 `5px`，选中态 `--accent` 填充
- **分隔线**：`1px solid --border`，选中态 `--accent`
- **标注框 (Callout)**：`--accent-soft` 背景，`--accent-line` 边框，圆角 `--r`，左侧图标
- **高亮 (Mark)**：`--accent-soft` 背景，`--text` 前景，圆角 `3px`
- **链接**：`--accent` 色，下划线 `--accent-line`

### 4.4 状态栏 (StatusBar)

- 高度 `28px`，背景 `--bg-panel`，顶部 `1px solid --border-soft`
- 左侧：上下文标记（`◆` + "正文"），`--text-dim`，`font-weight: 500`
- 右侧：字符数 · 词数 · 阅读时间 · 保存状态
- 保存状态色 `--accent`
- `font-variant-numeric: tabular-nums`

### 4.5 大纲抽屉 (Outline Drawer)

- 宽度 `296px`，背景 `--bg-panel`，左边框 `1px solid --border-soft`
- 头部：标题 "大纲"（`13px`，`font-weight: 600`）+ 提示 "点击跳转"
- **大纲行**：
  - H1：无缩进，`font-weight: 600`，`--text` 色
  - H2：`padding-left: 21px`
  - H3：`padding-left: 36px`，`font-size: 12px`
  - 左侧竖线指示器：`2px × 13px`（H1 `15px`），圆角 `2px`，默认 `--border`
  - 活跃行：背景 `--accent-soft`，竖线 `--accent`
  - 悬停：`--bg-hover`
  - 行间距 `1px`，圆角 `6px`，内边距 `5px 9px`
- **空状态**：居中文本 + 代码提示（"用 `# 标题` 创建大纲"）
- 跳转动画：`blk-flash` — `0.7s` ease，`30%` 时 `--accent-soft` 背景

### 4.6 Slash 命令菜单

- 宽度 `292px`，背景 `--bg-elev`，边框 `1px solid --border`，圆角 `10px`
- 阴影 `0 18px 48px oklch(0 0 0 / 0.45)`
- 入场动画：`0.12s ease`，从 `translateY(-4px) scale(0.99)` 到正常
- **分类标题**：`10px`，大写，`letter-spacing: .07em`，`--text-faint`
- **菜单项**：
  - 图标区：`26×26px`，圆角 `6px`，背景 `--bg-panel`，边框 `--border-soft`
  - 活跃态背景 `--accent-soft`，图标边框变 `--accent-line`
  - 名称 `13px`，`font-weight: 550`
  - 描述 `11px`，`--text-faint`
  - 快捷键 `10.5px`，等宽，`--text-faint`
- **底栏**：背景 `--bg-panel`，顶部 `1px solid --border-soft`，键盘提示
- 最大高度 `298px`，可滚动

---

## 5. 交互规范

### 5.1 过渡与动画

| 场景         | 属性                  | 时长      | 缓动       |
| ------------ | --------------------- | --------- | ---------- |
| 按钮悬停     | `background, color`   | `0.12s`   | linear     |
| 文件夹展开箭头 | `transform`         | `0.16s`   | ease       |
| 脏标记出现   | `opacity`             | `0.2s`    | linear     |
| 文件夹计数   | `opacity`             | `0.12s`   | linear     |
| Slash 菜单入场 | `opacity, transform`| `0.12s`   | ease       |
| 复选框       | `all`                 | `0.14s`   | linear     |
| 跳转闪烁     | `background`          | `0.7s`    | ease       |
| 开关 (toggle) | `background / transform` | `0.16s` | linear   |
| 大纲竖线     | `background`          | `0.12s`   | linear     |

### 5.2 滚动条

- 宽高 `11px`
- 拇指：`--border` 色，圆角 `8px`，`3px` 透明边框（`padding-box`）
- 悬停：`--text-faint`
- 面板区拇指边框色跟随 `--bg-panel`

### 5.3 键盘快捷键

| 操作       | 快捷键    |
| ---------- | --------- |
| 切换侧栏   | `⌘B`     |
| 切换大纲   | `⌘\`     |
| 设置       | `⌘,`     |
| 保存       | `⌘S`     |

### 5.4 交互模式

- **编辑器行内标记**：编辑态（光标所在块）显示 markdown 语法标记，非编辑态隐藏
- **文件夹计数**：仅在悬停时淡入显示
- **Slash 菜单**：输入 `/` 触发，键盘上下导航，`Enter` 确认，`Esc` 关闭
- **大纲跳转**：点击跳转到对应标题，目标块播放 `blk-flash` 动画
- **自动保存**：编辑后 `800ms` 无操作触发

---

## 6. 布局结构

```
┌─────────────────────────────────────────────────────┐
│                    Titlebar (38px)                   │
├──────────┬─────────────────────────┬────────────────┤
│ Sidebar  │      Editor Column      │    Drawer      │
│ (244px)  │        (flex: 1)        │   (296px)      │
│          │  ┌───────────────────┐  │                │
│ brand    │  │  editor-wrap      │  │  outline       │
│ search   │  │  max-w: 720px     │  │  heading rows  │
│ section  │  │  padding: 56/40   │  │                │
│ tree     │  │                   │  │                │
│          │  └───────────────────┘  │                │
├──────────┴─────────────────────────┴────────────────┤
│                   StatusBar (28px)                    │
└─────────────────────────────────────────────────────┘
```

- 使用 CSS Grid: `grid-template-rows: 38px 1fr`
- 主体区: `grid-template-columns: var(--sidebar-w) 1fr var(--drawer-w)`
- 侧栏可折叠（列宽变 `0px`），抽屉可折叠

---

## 7. 应用图标 (App Icon)

详见 [APP_ICON.md](APP_ICON.md)，本节为快速摘要。

| 属性 | 值 |
|------|----|
| 画布尺寸 | `1024 × 1024 px` RGBA PNG |
| Squircle | `x=50, y=50, w=924, h=924, rx=207`（四周 50px 透明边距） |
| 背景 | 顶部 `#d4a840` → 底部 `#b8882e` 线性渐变 |
| 字形 | "M"，Georgia serif，`460px`，`#1f1810`，居中 |
| 源文件 | `build/icon-square.svg` |
| 生成 | `qlmanage -t -s 1024 -o /tmp build/icon-square.svg` + Python 透明度修复脚本 |

### 关键约束

- `app.dock.setIcon()` **不会**自动裁切 squircle —— 必须在 PNG 中预先烘焙透明圆角
- `qlmanage` 渲染输出的圆角外像素为不透明白色（`alpha=255`），必须用脚本清零
- 50px 边距使 Dock 中图标大小与系统内置 ICNS 图标一致
