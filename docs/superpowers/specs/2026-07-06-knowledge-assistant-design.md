# margin 知识库助手（AI Tutor）设计 v2

日期：2026-07-06（v2 修订，同日推翻 v1 的 Hermes 宿主架构）
状态：已与用户逐节确认
参考物：**Heptabase AI Tutor**（https://heptabase.com/ai-tutor）——对话式教学会话、课程表生成、课后笔记入库、显式进度与断点续学；其技术栈为 Claude Agent SDK。
关联：margin 五期重构方案 `docs/superpowers/plans/2026-07-04-margin-refactor.md` 的 **P5 插件化是本设计的前置**（完整做完 P5 后再开工 Tutor）。

## v1 → v2 变更摘要

| 维度 | v1 | v2 |
|---|---|---|
| 核心循环 | 后台定时产文件 + IM 推送 | **应用内教学会话**（生成课程→逐课教学→答疑→课后笔记→显式进度） |
| 宿主 | Hermes Agent | **margin 内置插件 + Node sidecar**（无 Hermes，无 IM） |
| 进度来源 | 从 vault 活动反推 | 教学闭环内显式记录（反推信号保留为辅助） |
| LLM 编排 | 手写 prompt 生产线 | **Claude Agent SDK** 构建导师 agent，确定性模块降为 agent tools |
| 每日建议/日报 | 核心功能 | 辅助功能（headless 命令保留，"今日学什么"成为面板开场白） |

厚内核原则、文件协议思路、独立内核仓库、规则降级不变。

## 1. 背景与目标

margin 是面向 Obsidian vault 的桌面端 WYSIWYG Markdown 编辑器。目标是以 margin 插件的形式提供一个 AI 学习导师（对标 Heptabase AI Tutor），核心能力：

1. **教学会话（核心循环）**：用户说学习目标 → 生成结构化课程表 → 逐课对话式教学、课中随时提问 → 每课结束生成整理好的课程笔记写入 vault → 显式进度记录、断点续学
2. **每日学习建议（辅助）**：打开面板时的开场白（"欢迎回来，上次学到 X，今天建议 Y"）；headless `ma daily` 保留
3. **资讯日报（辅助，差异化保留项）**：拉取技术资讯流，按学习主题相关性筛选成报告，headless `ma report`

产品路线仍为自用验证 → 产品化；margin 插件形态本身就是产品化路径的一部分。

## 2. 总体架构：插件薄壳 + sidecar 厚内核

```
┌────────────────────────────────────────────────┐
│ margin（Tauri 桌面应用）                          │
│  ├─ AI Tutor 内置插件（chat 面板，纯前端薄壳）      │
│  │    经插件 API：ui.sidebar 面板 + vault.read     │
│  │    + assistant.bridge（新权限，Tutor 期新增）    │
│  └─ sidecar 桥（margin 宿主服务）：spawn 内核进程， │
│       stdio JSON-RPC，生命周期随插件启停            │
└──────────────┬─────────────────────────────────┘
               │ JSON-RPC over stdio
┌──────────────▼─────────────────────────────────┐
│ margin-assistant 内核（独立 TS 仓库，Node 进程）    │
│  ├─ 导师 agent（Claude Agent SDK）                │
│  ├─ agent tools = 确定性模块：vault 扫描、计划模型、 │
│  │   进度引擎、课程笔记写入、数据源连接器             │
│  ├─ 服务模式：ma serve（会话 JSON-RPC）            │
│  └─ headless 命令：ma daily / report / plan …     │
└──────────────┬─────────────────────────────────┘
               │ 文件协议（markdown + frontmatter）
┌──────────────▼─────────────────────────────────┐
│ vault：普通笔记 + 学习计划 + 课程笔记 + _assistant/ │
└────────────────────────────────────────────────┘
```

**切分原则**：智能与写入全部在内核（可独立测试、可复用、可换宿主）；margin 插件只做 UI 与桥接；API key 只存在于 sidecar 进程环境，绝不进渲染层。

**降级原则**：无 key 时教学会话不可用（面板显示配置引导），headless `ma daily`/`ma report` 走纯规则路径（同 v1）。

## 3. 文件协议 v2

### 3.1 学习计划（syllabus）

沿用 v1 结构（frontmatter `type: learning-plan` 任意位置发现；`## 主题` + `- [ ] 学习项`），语义升级：**学习项 = 课（lesson）**。教学会话按课推进，教完一课，导师在计划里勾选该项并补挂课程笔记链接：

```markdown
---
type: learning-plan
goal: 学习 Rust
status: active
created: 2026-07-06
---
## 所有权与借用
- [x] 所有权基础 [[Rust所有权基础 - 课程笔记]]
- [ ] 生命周期标注
```

- 两个入口不变：解析已有计划 / 会话里说"我想学 X"由导师生成（即原 `ma plan create` 能力并入 agent tool）
- **计划改写规则（v2 修订）**：教学会话中导师勾选进度、补挂笔记链接是核心体验，**允许**——会话在场即用户确认；headless 命令仍禁止任何计划改写；勾选之外的结构性修改（增删主题/课、改目标）仍需会话内明确复述确认

### 3.2 课程笔记（一次性生成，用户接管）

- 每课结束由导师生成，写入可配置目录（默认计划文件同目录下 `<计划文件名>/` 子目录）
- frontmatter 带 `generated-by: margin-assistant`、`type: lesson-note`、`lesson`（课名）、`plan`（计划相对路径）
- **写入用 `wx` 标志一次性创建，此后永不覆盖**——生成即归用户所有，用户可任意编辑；重学一课生成新文件（追加序号）

### 3.3 机器产物（`_assistant/`，同 v1）

```
_assistant/
├── config.yaml          # llm、数据源、课程笔记目录等
├── daily/…              # headless 每日建议
├── reports/…            # 资讯日报
└── .state/
    ├── progress/…       # 进度快照（周趋势）
    ├── sessions/…       # 会话断点（当前计划/课/小节位置），断点续学用
    └── seen-items.json  # 抓取去重
```

生成物 `generated-by` 保护规则同 v1：内核只覆盖带标记的文件（课程笔记除外——见 3.2 的 wx 规则，创建后连内核也不覆盖）。

### 3.4 进度信号

- **主信号（v2 新增）**：教学闭环显式记录——计划 checkbox（导师会话中勾选）+ `.state/sessions/` 断点
- 辅助信号（v1 保留）：关联笔记活跃度（git/mtime）、N 天未碰——供开场白和 headless daily 使用

## 4. 内核 `margin-assistant` v2

独立 TS 仓库；运行时依赖上限调整为：`@anthropic-ai/claude-agent-sdk`、`@anthropic-ai/sdk`、`js-yaml`、`fast-xml-parser`。

### 4.1 两种运行模式

| 模式 | 入口 | 用途 |
|---|---|---|
| 服务模式 | `ma serve --vault <path>`（stdio JSON-RPC） | margin 插件的教学会话后端 |
| headless | `ma daily / report / scan / plan / progress / fetch` | 辅助功能、调试、launchd 定时（可选） |

### 4.2 导师 agent（Claude Agent SDK）

- system prompt = 导师人格 + 教学法约束（逐课推进、先讲后问、课后小结）+ 文件协议规则
- agent tools（全部确定性、单测覆盖）：
  - `scan_vault` / `read_plan` / `compute_progress`（读）
  - `create_plan`（wx 新建）、`update_plan_progress`（仅限勾选与补挂链接）、`write_lesson_note`（wx 新建）
  - `fetch_sources`（日报用，服务模式一般不用）
- 会话状态：SDK session 续传 + `.state/sessions/` 落盘断点

### 4.3 JSON-RPC 服务界面（margin 桥的契约）

方法：`session.start(planPath | goal)` / `session.message(text)`（流式响应事件）/ `session.end()`；通知事件：`progress.updated`（margin 借此刷新面板/文件视图）。具体 schema 在实施计划中定义。

## 5. margin 侧

### 5.1 前置：完整执行 P5 插件化（已确认）

按重构方案 P5 章节原样执行（Task 5.1 贡献点与权限补齐、5.2/5.3 日程/大纲内置插件、5.4 PluginMarket 真实注册表）。**与本设计的衔接说明**：Task 5.1 中"删除宣而未实现的 network 权限"照做不冲突——Tutor 插件不需要渲染层网络（网络在 sidecar）；Tutor 期再新增 `assistant.bridge` 权限。

### 5.2 Tutor 插件（P5 完成后立项）

- 内置插件 `plugin-api/builtins/tutorPlugin.ts`：注册 sidebar 面板（chat UI）+ 命令（`tutor.open`、`tutor.continueLearning`）
- 新增插件权限 `assistant.bridge`；margin 宿主服务负责 spawn/监控/重启 sidecar（`@tauri-apps/plugin-shell`），把 stdio JSON-RPC 暴露给持权插件
- 开发期 sidecar = 系统 node + 内核仓库路径（settings 可配）；打包分发是产品化阶段议题，本期非目标

## 6. 错误处理

- sidecar 崩溃：桥自动重启一次，面板显示会话中断提示，断点从 `.state/sessions/` 恢复
- LLM/网络失败：会话内报错并可重试；headless 同 v1 降级
- 计划解析失败、数据源隔离、幂等：同 v1
- 并发写保护：教学会话期间 headless 命令若同时运行，以文件为准（内核写入都是原子单文件），冲突面可忽略

## 7. 测试策略

- agent tools 全部确定性单测（fixture vault，同 v1）
- JSON-RPC 服务：契约测试（mock agent，走真 stdio 回环）
- 导师 agent：SDK mock 测 tool 调用序列与协议约束（不勾选未确认项、wx 不覆盖）；教学质量靠人工金样例评估
- margin 桥与插件：pluginHost 测试模式照抄 + 桥的生命周期测试（spawn/崩溃重启/dispose）

## 8. 演进路径

1. **阶段一（前置）**：margin 完整执行 P5（既有计划，独立验收）
2. **阶段二（本设计主体）**：内核 v2（agent tools + serve + headless）+ margin 桥 + Tutor 插件 MVP（chat 面板走通教学闭环）
3. **阶段三（打磨/产品化）**：开场白每日建议、日报面板化、sidecar 打包分发、插件市场第三方安装（皆非本期）

## 9. 非目标（本期明确不做）

- Hermes / IM 推送（v1 遗产，已移除）
- 真·实时 vault 监听、FSRS 间隔重复、通用新闻源、多用户/云端（同 v1）
- sidecar 二进制打包分发、第三方插件安装机制
- 语音/画布类富教学形态——只做文本 chat 面板
