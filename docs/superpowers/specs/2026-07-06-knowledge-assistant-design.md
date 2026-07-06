# margin 知识库助手（margin-assistant）设计

日期：2026-07-06
状态：已与用户逐节确认
关联：margin 五期重构方案（`docs/superpowers/plans/2026-07-04-margin-refactor.md`）与本设计无依赖关系，可并行推进。

## 1. 背景与目标

margin 目前是面向 Obsidian vault 的桌面端 WYSIWYG Markdown 编辑器，纯本地、无后端。用户希望在其之上演进出一个「实时在线的知识库助手」，两项核心能力：

1. **每日学习助手（重点）**：每天告知今天该学什么、当前学习进度如何
2. **信息聚合报告**：拉取外部数据源（技术资讯流 + 与学习主题强相关的内容），整理成报告

产品路线为**自用验证 → 产品化**：第一阶段做个人工具快速验证价值，但架构上预留产品化边界，避免推倒重来。

「实时在线」在本期的定义是**每天定时 + 随叫随到（IM 对话）**；毫秒级 vault 变化监听明确不做。

## 2. 总体架构：厚内核 + Hermes 宿主

系统切成两层，通过 **CLI + 文件** 两种界面对接，无任何 SDK 级耦合：

```
┌─────────────────────────────────────────────┐
│ 宿主层：Hermes Agent（自托管常驻服务）          │
│  · cron 定时触发内核命令                       │
│  · IM 推送（私人 bot + 白名单）                │
│  · 对话问答（多轮工具调用，事实来自内核 CLI）     │
└──────────────┬──────────────────────────────┘
               │ 只通过 CLI 调用 / 读写协议文件
┌──────────────▼──────────────────────────────┐
│ 内核层：margin-assistant（独立 TS 包 + CLI）    │
│  · vault 扫描、计划模型、进度引擎（确定性）       │
│  · 数据源连接器（HN / GitHub Trending / RSS）   │
│  · LLM 工序（建议文案生成、资讯相关性打分）       │
│  · prompt 模板 = 有版本、有测试的代码资产        │
│  · 渲染器：按文件协议写回 vault                 │
└──────────────┬──────────────────────────────┘
               │ 文件协议（markdown + frontmatter）
┌──────────────▼──────────────────────────────┐
│ vault（普通笔记 + 学习计划 + _assistant/ 产物） │
│  margin / Obsidian 正常编辑浏览                │
└─────────────────────────────────────────────┘
```

**切分原则（已确认）**：厚内核。LLM 编排和 prompt 属于产品核心资产，必须沉淀在内核里；Hermes 只做值班员（调度、推送、对话入口）。产品化时搬走内核即搬走全部智能。

**降级原则**：内核所有命令在无 LLM key 时降级为纯规则输出（如「下一个未完成项 + N 天未碰清单」+ 未筛选的资讯列表），保持可用。

## 3. 文件协议

三方（内核、Hermes、margin/Obsidian）之间唯一的共享契约。协议 schema 与文档随内核仓库维护。

### 3.1 学习计划（用户文档，一等公民）

- **靠 frontmatter 发现，不靠目录**：vault 任意位置的笔记，frontmatter 含 `type: learning-plan` 即被识别
- 结构：

```markdown
---
type: learning-plan
goal: 学习 Rust
status: active        # active | paused | done
created: 2026-07-06
---
## 所有权与借用
- [x] 所有权基础 [[Rust所有权笔记]]
- [ ] 生命周期标注
## 并发
- [ ] async 基础
```

- 二级标题 = 主题（topic），checkbox 列表项 = 学习项（item），学习项可用 `[[wiki 链接]]`关联笔记
- **两个入口，一个结构**：解析用户已有计划（导入时规范化为上述结构）与「我想学 X」由 LLM 生成路线图，产出的都是这份文档
- **计划文件的修改必须经用户确认**：内核/Hermes 不得静默改写计划（含 checkbox）；生成新计划时若目标文件已存在则报错不覆盖

### 3.2 机器产物（`_assistant/`，位置可在 config 中改）

```
_assistant/
├── config.yaml          # 数据源列表、LLM 配置、输出路径、调度偏好
├── daily/2026-07-06.md  # 每日学习建议
├── reports/2026-07-06.md# 资讯日报
└── .state/              # 抓取去重缓存、进度快照（用于周趋势对比）
```

- 所有生成文件 frontmatter 带 `generated-by: margin-assistant` 与 `generated-at`
- **写入安全规则**：内核只覆盖带 `generated-by` 标记的文件；`_assistant/` 之外仅允许 `ma plan create` **新建**计划文件（已存在即报错，永不覆盖），其余场景只读；绝不触碰用户普通笔记

### 3.3 进度信号定义

某学习项的进度状态由以下信号合成：

1. checkbox 勾选状态（完成/未完成）
2. 关联 `[[笔记]]` 的活跃度：vault 为 git 仓库时用 git 历史，否则以文件 mtime 兜底
3. 「N 天未碰」：主题下所有关联笔记的最近活跃时间距今天数

主题进度 = 该主题下学习项完成率；计划进度 = 各主题加权（按学习项数量）。进度快照定期写入 `.state/`，支持「比上周」趋势。

## 4. 内核 `margin-assistant`

- **独立仓库**（不进 margin monorepo），TypeScript，与 margin 技术栈一致，为将来 sidecar 嵌入铺路
- 将来若需与 margin 共享协议类型，再抽 `@margin/assistant-protocol` 包（本期不做）

### 4.1 模块与 CLI

| 模块 | 职责 | CLI（stdout 输出 JSON，render/daily/report 除外） |
|---|---|---|
| vault-scanner | 笔记清单、wiki 链接图、mtime、git 活跃度 | `ma scan` |
| plan-model | 计划文档解析/校验/序列化；`ma plan create` 走 LLM 生成路线图 | `ma plan list / check / create` |
| progress-engine | 规则进度：完成率、N 天未碰、下一个未完成项、周趋势 | `ma progress` |
| connectors | HN、GitHub Trending、RSS 三种连接器，可插拔接口，带去重缓存 | `ma fetch` |
| llm | LLM 客户端 + prompt 模板（建议文案、相关性打分、路线图生成） | （被上层命令调用） |
| renderer | 结构化结果 → 协议 markdown 写回 vault | `ma render` |
| 编排 | 端到端生产线 | `ma daily`（进度→建议→写回）、`ma report`（抓取→筛选→写回） |

### 4.2 LLM 工序（内核内）

- `ma daily`：进度 JSON + 近期 vault 活跃摘要 → prompt 模板 → 当日建议文案（学什么、为什么、复习什么）
- `ma report`：抓取条目 × 计划主题 → 相关性打分与摘要 → 高相关条目自动 `[[链接]]` 到用户笔记
- API key 从 config.yaml 或环境变量读取；无 key 时全部命令走规则降级路径

## 5. Hermes 宿主层

Hermes Agent（Nous Research，自托管）承担三个职责，skill 定义存放于内核仓库 `hosts/hermes/` 目录（受版本管理，随时可弃）：

1. **每日学习 job**（cron，早 8:00）：调 `ma daily` → 读生成文件 → IM 推送摘要
2. **每日情报 job**（cron，早 8:30）：调 `ma report` → IM 推送摘要
3. **对话 skill**：IM 里问「我学到哪了」→ 调 `ma progress` 等取事实再回答，禁止凭空编造进度；涉及修改计划的请求需向用户复述确认后才落盘

**依赖纪律（已确认）**：

- 内核零 Hermes 依赖；接口只有 CLI + 文件
- IM 网关只绑私人 bot + 白名单，不开公网 webhook
- **退出通道**：launchd 直接 cron `ma daily` / `ma report` + macOS 系统通知即可完全替代调度职责，仅损失 IM 推送与对话

## 6. 错误处理

- **数据源隔离**：单源抓取失败不影响日报生成，报告尾部注明「今日 X 源不可用」
- **LLM 失败**：重试有限次后走规则降级路径，产物 frontmatter 标注 `degraded: true`
- **计划解析失败**：`ma plan check` 给出具体行号与原因；解析失败的计划不参与进度计算，日报/建议中提示
- **幂等**：同日重复运行 `ma daily` / `ma report` 覆盖当日生成文件（受 `generated-by` 标记保护）
- **Hermes 不可用**：不影响内核手动/launchd 运行

## 7. 测试策略

- **内核单测**：fixture vault（含正常/畸形计划、git 与非 git 两种形态）
- **connectors**：录制真实响应做回放测试，不打真网
- **renderer**：快照测试锁定协议文件格式
- **LLM 工序**：mock 客户端测编排与降级路径；prompt 模板变更靠人工评估 + 少量金样例
- **端到端**：`ma daily` 对 fixture vault 的降级模式全链路测试（无 LLM，纯确定性，可进 CI）

## 8. 演进路径（已确认）

1. **阶段一（本期）**：内核 v0 + Hermes 两个定时 job + 对话 skill，纯自用，margin 零改动
2. **阶段二（验证有效后）**：margin 加**只读感知**——识别 `learning-plan` / `generated-by` frontmatter，渲染进度条与今日面板；margin 保持零网络零 LLM，未装助手的用户无感知
3. **阶段三（产品化）**：内核作为 sidecar 嵌入 margin（tauri-plugin-shell 运行 Node 二进制，热路径按需移植 Rust），应用内调度 + 用户自备 API key，IM 推送换系统通知；Hermes 退出产品图景

## 9. 非目标（本期明确不做）

- margin 应用内的任何 UI 改动（阶段二内容）
- 真·实时 vault 监听
- 间隔重复（FSRS）调度——进度信号里的「N 天未碰」是其低配替代，效果验证后再考虑
- 通用新闻/公众号类数据源（只做 HN / GitHub Trending / RSS）
- 面向定向主题的主动搜索型情报（先靠 RSS 源配置 + 相关性筛选覆盖）
- 多用户 / 云端部署
