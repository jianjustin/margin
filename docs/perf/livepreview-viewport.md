# livePreview viewport 化 — 性能对比

测试文档：2400 行混合 markdown（见 test/livePreview.bench.ts 的 bigDoc）。
命令：`npx vitest bench --run test/livePreview.bench.ts`

## 基线（重构前，commit 141e0a3）

| bench | mean | hz |
| --- | --- | --- |
| full-doc collectDecorations（旧路径） | 7.1160 | 140.53 |

## 重构后

（Task 6 填写）
