import { createRoot } from 'react-dom/client'
import { Editor } from '@/components/Editor'
import './index.css'

const DOC = `---
title: 所见即所得测试
tags:
  - markdown
  - editor
done: true
count: 42
date: 2026-06-07
---

# 一级标题（不应有下划线）

## 二级标题

正文包含 **加粗**、*斜体*、~~删除线~~ 和 \`行内代码\`。

\`\`\`typescript
function longLine(): void {
  const veryLongVariableNameThatShouldOverflow = "this line is intentionally very long so that the code block needs a horizontal scrollbar instead of wrapping"
  console.log(veryLongVariableNameThatShouldOverflow)
}
\`\`\`

| 功能 | 状态 | 优先级 |
| :--- | :---: | ---: |
| 代码高亮 | 完成 | 高 |
| 表格渲染 | 完成 | 中 |
| 属性面板 | 完成 | 高 |

> 引用块示例。

- [x] 已完成任务
- [ ] 待办任务
`

function Demo(): JSX.Element {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)' }}>
      <Editor docKey="demo" initialValue={DOC} onChange={() => {}} onSave={() => {}} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
