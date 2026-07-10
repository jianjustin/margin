# margin 文档挂子文档（Folder Note）设计

日期：2026-07-10
状态：已与用户逐节确认
动机：引入 Notion 式"文档即容器"的组织心智——任何 md 文档都可以直接往下挂子文档，不必先建文件夹再建笔记。

## 1. 结论与原则

**采用 Folder Note 方案（`Foo/Foo.md` 同名约定）**：一个 folder 若包含与其同名的 md 文件，在 UI 中合并显示为"一个可展开的文档"。

三条不动摇的原则：

1. **磁盘即真相**：磁盘上仍然只有纯 folder + md，不引入任何索引文件、frontmatter 元数据或数据库。用 Finder/git/Obsidian 打开 vault，结构完全自洽。
2. **共存而非取代**：普通 folder 仍是 folder，folder note 是叠加的增量能力。现有 vault 零迁移。
3. **零 Rust/契约改动**：`vault_scanner.rs`、`VaultNode`、IPC `TreeNode` 均不变。全部逻辑落在 vault-core 派生层与 React UI。

### 已否决的替代方案

| 方案 | 否决原因 |
|---|---|
| `Foo/index.md` | 重命名只改一处，但全库搜索满屏 index.md，文件名不携带语义，wikilink 不可读 |
| 文件名编码层级（Dendron `foo.bar.md`） | 与现有 folder 体系冲突，对树模型侵入大 |
| frontmatter `parent:` / 独立索引 | 层级与文件系统解耦，破坏"磁盘即真相"，索引会漂移，对 local-first 定位是负资产 |
| 不动磁盘、仅 UI 合并同级 `Foo.md` + `Foo/` | 零迁移，但 md 与子文档磁盘上分家，移动/删除易分裂 |

## 2. 派生规则（vault-core）

在 `src/renderer/src/vault-core/fileTree.ts` 层新增纯函数派生（配单元测试）：

- **判定**：folder 节点 `Foo/` 的 children 中存在文件名（去 `.md/.markdown/.mdx` 扩展名、大小写不敏感）等于 folder 名的 md 文件 → 该 folder 是一个 **container 文档**，其 folder note 为 `Foo/Foo.md`。
- **展示合并**：container 在文件树中渲染为单行文档（带展开箭头）。点击行打开 `Foo/Foo.md`；展开后显示 folder 内其余条目（不含 folder note 自身），排序规则沿用现有 `sortNodes`。
- **图标/样式**：container 行使用文档图标（可带层级提示角标），与普通 folder 区分。
- **既有结构自动生效**：现有 vault 中恰好符合 `Foo/Foo.md` 结构的目录会自动以 container 形态展示。这是预期行为。

派生只影响展示与交互映射，`VaultSnapshot`/`VaultNode` 数据本身不变；搜索、backlinks、move dialog 等消费原始树的逻辑不受影响（filterTree 等如需感知 container 仅做展示适配）。

## 3. 交互与操作

### 3.1 新建子文档

md 文件行的右键菜单新增"新建子文档"：

- 若目标是普通 `Foo.md`：先**转换为 container**——创建同级 folder `Foo/`，将 `Foo.md` 移入得到 `Foo/Foo.md`——再在 `Foo/` 内创建子文档。
- 若同级已存在同名 folder `Foo/`：不新建 folder，直接把 `Foo.md` 移入视为合并。
- 若目标已是 container 的 folder note：直接在其 folder 内创建。
- 转换由现有 `VaultOperation` 组合完成（create-folder + move + create-note），不新增 Rust 命令。

container 行右键同样提供"新建子文档"（等价于在 folder 内建笔记）。

### 3.2 重命名

container 重命名 = 两步：folder 改名 + 内部 folder note 改名。若中途失败（folder 已改、md 未改），结构自然退化为"普通 folder + 普通 md"，无数据损坏，用户可手工修复——方案自愈性好，不做回滚机制。

### 3.3 移动 / 删除

- 移动 container = 移动 folder（现有能力，folder note 随之移动）。
- 删除 container = trash 整个 folder（沿用现有 trash 行为，需在确认文案中说明含子文档）。
- 单独删除 `Foo/Foo.md` → container 退化为普通 folder（合法状态，无需特殊处理）。

### 3.4 退化行为

删光子文档后 container **保持 container 形态**，不自动塌回平铺的 `Foo.md`。理由：自动塌回会与文件监听产生竞态，且行为不可预测。如需还原，用户手工把 md 移出即可（未来可选提供"转换回普通文档"菜单项，本期不做）。

## 4. 链接完整性

已验证 `src/renderer/src/lib/wikiLinks.ts` 的解析是**按文件名全库匹配**（`[[Foo]]` 不依赖路径）：

- `Foo.md → Foo/Foo.md` 转换不改变文件名，**按名 wikilink 全部存活**。
- 带路径的链接（`[[dir/Foo]]` 形式，靠 path 后缀匹配）转换后会断。接受此代价，不做链接重写（本期）。

## 5. 不做的事（YAGNI）

- 不做拖拽"把文档拖进文档"（移动走现有 move dialog）。
- 不做嵌套深度的特殊优化（folder 天然可嵌套）。
- 不做链接自动重写。
- 不做"彻底 Notion 化"（UI 中消灭 folder 概念）——已明确选择共存路线。
- 不改 Swift/iOS 侧契约。

## 6. 测试

- **vault-core 派生**：container 判定（同名、大小写、多扩展名）、合并展示的 flatten 结果、folder note 自身从 children 中排除、边界（folder 含同名子 folder 而非 md、空 folder）。
- **转换操作**：普通 md → container 的操作序列；同级已有同名 folder 的合并路径；名字冲突走现有 conflict-suffix 逻辑。
- **重命名**：两步改名的成功路径；第一步成功第二步失败后的退化状态可打开、可再操作。
- **链接**：转换前后 `[[Foo]]` 解析结果不变（单测 `resolveWikiLinkTarget`）。
