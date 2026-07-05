# livePreview viewport 化 — 性能对比

测试文档：2400 行混合 markdown（见 test/livePreview.bench.ts 的 bigDoc）。
命令：`npx vitest bench --run test/livePreview.bench.ts`

## 基线（重构前，commit 141e0a3）

| bench | mean (ms) | hz (ops/s) |
| --- | --- | --- |
| full-doc collectDecorations（旧路径） | 7.1160 | 140.53 |

## 重构后

| bench | mean (ms) | hz (ops/s) |
| --- | --- | --- |
| viewport collectInlineDecorations（新路径 ±30 行） | 0.3117 | 3,208.26 |
| block reveal 位图检查（新路径 StateField） | 0.0408 | 24,500.61 |
| **合计（两路径之和）** | **0.3525** | **~2,860** |

## 性能结论

旧路径（full-doc）mean 7.7537 ms vs 新路径（inline 窗口 + block 位图）合计 0.3525 ms，**降速 22.0 倍**。新路径通过限制 inline 收集至视口窗口范围、block 区域采用快速位图检查，大幅降低光标移动的单次成本。
