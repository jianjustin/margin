# M1 手动验收

日期：2026-05-30
验收人：<待填>
使用的 vault：`~/Library/CloudStorage/OneDrive-个人/笔记库`

逐项核对通过后打勾；发现的问题写在下方"问题 / 备注"。

- [ ] 启动后显示"Welcome to Margin"欢迎页，有"Choose Vault"按钮
- [ ] 选择 vault 后左栏加载出文件树
- [ ] 文件树中可见 `.obsidian`、`.claude`、`.trash`（若存在）等隐藏目录
- [ ] 点击文件夹后，中栏显示该目录下的 `.md` 笔记
- [ ] 点击笔记后，右栏编辑器加载该笔记内容
- [ ] 在编辑器中输入时出现橙色"未保存"圆点
- [ ] 停止输入约 1 秒后，橙色圆点消失（自动保存生效）
- [ ] 重新打开同一笔记，能看到刚才保存的内容
- [ ] Cmd-S 立即保存
- [ ] Cmd-Shift-O 重新弹出 vault 选择器
- [ ] 退出并重新启动后，恢复：窗口位置、栏宽、上次的 vault（无需重选）、上次打开的笔记
- [ ] 在外部程序（如 Obsidian）修改同一 `.md` 后切回 Margin：当前不会自动重载（已延后到 M2 的文件监听），确认行为符合预期

## 如何启动

```bash
cd /Users/jianjustin/workspaces/margin
open build/Build/Products/Debug/Margin.app
```

或重新构建后启动：
```bash
xcodebuild -scheme Margin -configuration Debug -derivedDataPath build/ -destination "platform=macOS" build
open build/Build/Products/Debug/Margin.app
```

## 已知限制（延后至 M2+）

- 暂无 Markdown 渲染——编辑器只显示原始文本（M3）
- 暂无双链 `[[ ]]`（M4）
- 暂无搜索（M2）
- 暂无反向链接面板（M4）
- 暂无 Tag 树（M5）
- 暂无外部文件变更自动重载（M2）
- 最低系统版本：macOS Sonoma (14.0)

## 问题 / 备注

-
