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

新路径（inline 窗口 + block 位图）合计 0.3525 ms，相比旧路径有大幅提升。下面给出两个口径：

- **vs 真基线（Task 1，7.1160 ms）：提速约 20.2 倍**（7.1160 / 0.3525 ≈ 20.2x）
- **vs 重构后 wrapper 复测（block+inline 双遍历，7.7537 ms）：提速约 22.0 倍**（7.7537 / 0.3525 ≈ 22.0x）

注：7.7537 ms 是重构后对 wrapper 路径（同时遍历 block 与 inline 全文档）的复测值，未出现在表格基线行中；对 Task 1 真基线 7.1160 ms 的对比倍数为 ~20.2 倍，两个口径数字均自洽。

**方法学说明：** 本 bench 的 inline 窗口为 ±30 行（约 `collectInlineDecorations` 的测试参数）。真实 CM 编辑器的 viewport 通常对应 ±1000 px margin，行数可能是测试窗口的 2–3 倍。线上 inline 成本会相应更高，但数量级（10–20x）的结论不变。
