# M3 手动验收

日期：2026-05-30
验收人：<待填>

- [ ] 打开 vault 中含标题的笔记：H1/H2/H3 字号呈现差异（H1=28pt、H2=24pt、H3=20pt、H4+=18pt）
- [ ] 段落中含 `**粗体**`：光标不在该段时只看到"粗体"（加粗），`**` 隐形
- [ ] 段落中含 `*斜体*`：光标移开后 `*` 隐形，"斜体"以斜体显示
- [ ] 段落中含 `[[wiki link]]`：未激活时仅显示"wiki link"（蓝色 #4A90E2）；激活时 `[[ ]]` 也呈蓝色
- [ ] 段落中含 `#tag`：未激活时仅显示 "tag"（紫色 #5856D6）；激活时 `#` 也变紫色
- [ ] 段落中含 `` `code` ``：等宽字体 + 浅灰背景，未激活时反引号隐形
- [ ] 把光标移到一行 → 该段所有 markdown 语法字符变可见（primary color）
- [ ] 把光标移到空行 → 之前的活动段落语法变回隐形
- [ ] 长笔记键入时无明显卡顿（>1000 字时可能掉帧——M7 处理）

## 启动

```bash
open /Users/jianjustin/workspaces/margin/build/Build/Products/Debug/Margin.app
```

## 已知限制（M7 polish 处理）

- 隐藏语法字符仍占用水平空间（前景色 = clear，非真正 zero-advance；Bear 是 zero-advance glyph）
- 渲染策略是"全文 restyle"，超长笔记键入可能掉帧
- 图片 `![alt](path)` 未行内显示
- 代码块语法高亮缺席
- 列表 / 引用块视觉差异有限（M7 加入更精细 paragraph metrics）

## 验收数据

- BUILD SUCCEEDED
- 57 unit tests passed（M1: 13 → M2: 39 → M3: 57，新增 18 个）
- 模块新增：`Sources/Margin/Editor/`（Typography、RangeConverter、ActiveParagraph、MarkdownStyler）
- 依赖新增：swift-markdown 0.8.0

## 问题 / 备注

-
