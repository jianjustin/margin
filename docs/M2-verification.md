# M2 手动验收

日期：2026-05-30
验收人：<待填>
使用的 vault：`~/Library/CloudStorage/OneDrive-个人/笔记库`

- [ ] 启动后选 vault，console / Activity Monitor 可见后台索引活动（也可 `tail -f ~/Library/Logs/Margin/...` 若有；M2 内可仅用 console log 验证）
- [ ] 索引完成后文件存在：`ls ~/Library/Application\ Support/Margin/index.sqlite`
- [ ] Cmd-Shift-F 弹出搜索面板（720×480 居中）
- [ ] 输入 vault 中肯定存在的词（如"投资"或"PKM"），停顿 ~150ms 后出现结果
- [ ] 结果包含标题 + 高亮 snippet（«» 标记）+ 相对路径
- [ ] 点击结果跳到对应笔记，sheet 关闭
- [ ] 在 Obsidian 里修改一篇 .md，回到 Margin 再搜，能搜到新内容（可能等 1-2 秒 watcher debounce）
- [ ] 在 Obsidian 里新建一篇 .md，回到 Margin，文件树里出现（rescan 被 watcher 触发）
- [ ] 在 Obsidian 里删除一篇 .md，回到 Margin，搜索该笔记 0 结果

## 启动

```bash
open /Users/jianjustin/workspaces/margin/build/Build/Products/Debug/Margin.app
```

## 已知限制（M3+ 处理）

- 编辑器仍是纯文本（M3 才有内联渲染）
- 没有双链跳转（M4）
- 没有反向链接面板（M4）
- 没有 tag 树视图（M5）
- 没有 Cmd-K 命令面板（M6）

## 验收数据

构建 + 测试结果：
- BUILD SUCCEEDED
- 39 unit tests passed (M1: 13 → M2: +26)

## 问题 / 备注

-
