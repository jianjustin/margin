/* ============ MARGIN — block library + sample data ============ */

// Block library: used by both the drawer and the slash menu.
const BLOCK_LIB = [
  { cat: "基础", items: [
    { type: "h1",       icon: "H₁", name: "标题 1",   desc: "大号章节标题",       key: "#" },
    { type: "h2",       icon: "H₂", name: "标题 2",   desc: "小节标题",           key: "##" },
    { type: "h3",       icon: "H₃", name: "标题 3",   desc: "子标题",             key: "###" },
    { type: "paragraph",icon: "¶",  name: "正文",     desc: "普通段落文本",       key: "" },
    { type: "bullet",   icon: "•",  name: "无序列表", desc: "圆点项目符号",       key: "-" },
    { type: "numbered", icon: "1.", name: "有序列表", desc: "自动编号列表",       key: "1." },
    { type: "todo",     icon: "☑",  name: "待办",     desc: "可勾选清单",         key: "[]" },
  ]},
  { cat: "结构", items: [
    { type: "quote",    icon: "❝",  name: "引用",     desc: "引用块",             key: ">" },
    { type: "callout",  icon: "✦",  name: "标注",     desc: "高亮提示框",         key: "" },
    { type: "divider",  icon: "—",  name: "分割线",   desc: "水平分隔",           key: "---" },
    { type: "table",    icon: "▦",  name: "表格",     desc: "3×3 数据表格",       key: "" },
  ]},
  { cat: "媒体与代码", items: [
    { type: "code",     icon: "</>",name: "代码块",   desc: "语法高亮代码",       key: "```" },
    { type: "image",    icon: "▣",  name: "图片",     desc: "拖入或上传图片",     key: "" },
  ]},
];

function libItem(type) {
  for (const g of BLOCK_LIB) for (const it of g.items) if (it.type === type) return it;
  return null;
}

// Sample documents — authored as markdown, parsed into blocks on load.
const NOTES = [
  {
    id: "n1", icon: "✦", title: "Margin · 使用指南", tag: "上手",
    mtime: "刚刚",
    md: `这是一份**所见即所得**的 Markdown 文档。把光标移进任意段落，可以看到原始标记（如 \`*\` \`#\`）；移开后立即渲染成排版结果。

## 三种插入块的方式

- 点击右上角的 *方块* 图标，从 **块库抽屉** 拖拽或点击任意块
- 在空段落里输入 \`/\` 唤起命令菜单，键入名称筛选
- 直接输入 Markdown 语法，比如 \`## \` 会立刻变成二级标题

## 试试这些

- [x] 勾选这个待办看看效果
- [ ] 把一个块拖到别处重新排序
- [ ] 在下面的代码块里改点东西

> 提示：行首输入 \`> \` 即可生成引用块，\`- \` 生成列表。

\`\`\`javascript
// 实时语法高亮
function greet(name) {
  const msg = \`你好, \${name}!\`;
  return msg.padEnd(20, "·");
}
greet("Margin");
\`\`\`

字数与阅读时间会在底部状态栏实时更新。`,
  },
  {
    id: "n2", icon: "✎", title: "周会纪要 · 5 月", tag: "工作",
    mtime: "2 小时前",
    md: `## 待跟进

- [ ] 把抽屉的拖拽手感再调一版
- [x] 确认深色主题的强调色
- [ ] 整理下周的设计评审材料

## 决议

> 编辑器优先做「光标块显标记、移开即净化」的方案，对齐 Typora。

| 模块 | 负责人 | 状态 |
| --- | --- | --- |
| 块库抽屉 | 阿楷 | 进行中 |
| 实时渲染 | 阿楷 | 已完成 |
| 代码高亮 | 小林 | 待开始 |`,
  },
  {
    id: "n3", icon: "❧", title: "读书笔记 · 写作之道", tag: "随笔",
    mtime: "昨天",
    md: `# 论简洁

清晰的写作来自清晰的思考。

> 一千个「不」，才换来一个「是」。

删掉每一个不为意义服务的词。留白也是内容的一部分 —— 正如这页右侧的页边距 *(margin)*，给思想留出呼吸的空间。

---

下一则随笔从这里继续……`,
  },
];

// ---------- file tree (folders + files) ----------
// files map to NOTES via noteId; others are generated placeholders on open.
const FILE_TREE = [
  { type: "folder", name: "日常", open: true, children: [
    { type: "file", name: "使用指南.md", noteId: "n1" },
    { type: "file", name: "写作之道.md", noteId: "n3" },
    { type: "file", name: "晨间随记.md" },
  ]},
  { type: "folder", name: "工作", open: true, children: [
    { type: "file", name: "周会纪要 · 5月.md", noteId: "n2" },
    { type: "folder", name: "归档", open: false, children: [
      { type: "file", name: "Q1 复盘.md" },
      { type: "file", name: "Q2 OKR.md" },
      { type: "file", name: "设计评审记录.md" },
    ]},
  ]},
  { type: "folder", name: "灵感", open: false, children: [
    { type: "file", name: "产品想法.md" },
    { type: "file", name: "配色实验.md" },
    { type: "file", name: "moodboard.canvas" },
  ]},
  { type: "file", name: "草稿.md" },
  { type: "file", name: "TODO.md" },
  { type: "file", name: ".DS_Store" },
  { type: "folder", name: ".obsidian", open: false, children: [
    { type: "file", name: "app.json" },
    { type: "file", name: "workspace.json" },
    { type: "file", name: "appearance.json" },
  ]},
  { type: "file", name: "~$临时备份.tmp" },
];

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "gold",
  font: "sans",
  size: 16,
  leading: 1.72,
  width: 720,
  ignore: [".DS_Store", ".obsidian/", "*.tmp"],
  showIgnored: false,
};

const ACCENTS = {
  gold:       { name: "暖金", h: 90,  c: 0.11 },
  terracotta: { name: "赤陶", h: 45,  c: 0.13 },
  blue:       { name: "靛蓝", h: 250, c: 0.12 },
  green:      { name: "苔绿", h: 150, c: 0.11 },
  violet:     { name: "紫罗兰", h: 300, c: 0.12 },
};

const FONTS = {
  sans:   { name: "IBM Plex Sans", stack: '"IBM Plex Sans","IBM Plex Sans SC",system-ui,sans-serif' },
  serif:  { name: "IBM Plex Serif", stack: '"IBM Plex Serif","IBM Plex Sans SC",Georgia,serif' },
  system: { name: "系统默认", stack: 'system-ui,-apple-system,"IBM Plex Sans SC",sans-serif' },
  mono:   { name: "IBM Plex Mono", stack: '"IBM Plex Mono","IBM Plex Sans SC",ui-monospace,monospace' },
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS);
