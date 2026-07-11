# 应用图标重设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「白底曲线连接旁注节点」新图标替换现有暗色纸张图标,覆盖 SVG 源、PNG、icns、ico 全部产物。

**Architecture:** 规范源是 `build/icon-square.svg`(1024px,squircle 几何与旧版完全一致),经 qlmanage + Python 校验脚本导出 1024 PNG,再用 `tauri icon` 从该 PNG 生成 Tauri 打包所需的全尺寸图标。导出管线零改动。

**Tech Stack:** SVG、qlmanage(macOS Quick Look)、Python 3(标准库)、@tauri-apps/cli(`tauri icon`)。

**Spec:** `docs/superpowers/specs/2026-07-11-app-icon-redesign-design.md`

## Global Constraints

- 画布 `1024 × 1024 px`,squircle `x=88, y=88, w=848, h=848, rx=190`(与旧版一致,导出脚本依赖此几何)。
- 色板仅 4 个值:底 `#FFFFFF`、底描边 `#E7E3D9`、墨 `#1E1C17`、金 `#C79A3B`。无渐变、无投影、无 filter。
- PNG 导出校验必须输出 `corner_alpha=0 center_alpha=255`。
- 不改动 `docs/design/APP_ICON.md` 中的 Export 流程脚本,不改动 `src-tauri/tauri.conf.json`。
- 所有提交信息用中文,结尾带 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 替换 SVG 规范源

**Files:**
- Modify: `build/icon-square.svg`(整文件替换)
- Modify: `build/icon.svg`(整文件替换,内容与上者相同)

**Interfaces:**
- Produces: `build/icon-square.svg` — Task 2 的 qlmanage 输入;两份 SVG 内容必须逐字节一致。

- [ ] **Step 1: 写入新 SVG 内容**

将以下内容完整写入 `build/icon-square.svg`,再将同样内容完整写入 `build/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="88" y="88" width="848" height="848" rx="190" fill="#FFFFFF"/>
  <rect x="90" y="90" width="844" height="844" rx="188" fill="none" stroke="#E7E3D9" stroke-width="4"/>
  <path d="M412 384 C 540 400 600 430 620 512" fill="none" stroke="#C79A3B" stroke-width="34" stroke-linecap="round"/>
  <path d="M412 640 C 540 624 600 594 620 512" fill="none" stroke="#C79A3B" stroke-width="34" stroke-linecap="round"/>
  <rect x="384" y="240" width="56" height="544" rx="28" fill="#1E1C17"/>
  <circle cx="412" cy="384" r="58" fill="#C79A3B"/>
  <circle cx="412" cy="640" r="58" fill="#C79A3B"/>
  <circle cx="620" cy="512" r="58" fill="#C79A3B"/>
</svg>
```

说明:描边矩形内缩 2px(`x=90, rx=188`),使 4px 描边完全落在 squircle 边界内,不会被 Task 2 的透明裁剪削掉。绘制顺序为 底 → 描边 → 两条弧线 → 墨干 → 三圆点,弧线端头被墨干和圆点覆盖。

- [ ] **Step 2: 验证两份 SVG 一致且可渲染**

Run: `diff build/icon-square.svg build/icon.svg && qlmanage -t -s 256 -o /tmp build/icon-square.svg && echo OK`
Expected: 无 diff 输出,最后一行 `OK`;`/tmp/icon-square.svg.png` 生成成功。可用 `open /tmp/icon-square.svg.png` 目检:白底、墨色竖干、三个金点、两条金色弧线。

- [ ] **Step 3: Commit**

```bash
git add build/icon-square.svg build/icon.svg
git commit -m "feat(icon): 替换图标 SVG 源为白底旁注节点方案"
```

---

### Task 2: 导出 1024px PNG 并通过 alpha 校验

**Files:**
- Modify: `build/icon.png`
- Modify: `src-tauri/icons/icon.png`

**Interfaces:**
- Consumes: `build/icon-square.svg`(Task 1 产物)。
- Produces: `build/icon.png` — Task 3 的 `tauri icon` 输入;1024×1024 RGBA,squircle 外四角 alpha=0。

- [ ] **Step 1: 用 Quick Look 渲染 1024px PNG**

Run: `qlmanage -t -s 1024 -o /tmp build/icon-square.svg`
Expected: 输出含 `Produced 1 thumbnails`,生成 `/tmp/icon-square.svg.png`。

- [ ] **Step 2: 运行透明裁剪与校验脚本**

以下脚本与 `docs/design/APP_ICON.md` Export 一节完全相同,原样运行:

```bash
python3 - <<'PY'
import shutil
import struct
import zlib
from pathlib import Path

src = Path('/tmp/icon-square.svg.png')
out = Path('build/icon.png')
copy = Path('src-tauri/icons/icon.png')
raw = src.read_bytes()

pos = 8
idat = []
width = height = None
while pos < len(raw):
    length = struct.unpack('>I', raw[pos:pos + 4])[0]
    name = raw[pos + 4:pos + 8]
    data = raw[pos + 8:pos + 8 + length]
    if name == b'IHDR':
        width = struct.unpack('>I', data[0:4])[0]
        height = struct.unpack('>I', data[4:8])[0]
    elif name == b'IDAT':
        idat.append(data)
    pos += 12 + length
    if name == b'IEND':
        break

if width != 1024 or height != 1024:
    raise SystemExit(f'unexpected size: {width}x{height}')

bpp = 4
stride = 1 + width * bpp
decompressed = zlib.decompress(b''.join(idat))
rows = []
prev = bytearray(width * bpp)

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c

for y in range(height):
    ft = decompressed[y * stride]
    row = bytearray(decompressed[y * stride + 1:y * stride + stride])
    if ft == 1:
        for i in range(bpp, len(row)):
            row[i] = (row[i] + row[i - bpp]) & 0xff
    elif ft == 2:
        for i in range(len(row)):
            row[i] = (row[i] + prev[i]) & 0xff
    elif ft == 3:
        for i in range(len(row)):
            a = row[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + ((a + prev[i]) // 2)) & 0xff
    elif ft == 4:
        for i in range(len(row)):
            a = row[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + paeth(a, b, c)) & 0xff
    elif ft != 0:
        raise SystemExit(f'unsupported PNG filter: {ft}')
    rows.append(row)
    prev = bytearray(row)

x1, y1, x2, y2, rx = 88, 88, 936, 936, 190
for y, row in enumerate(rows):
    for x in range(width):
        dx = max(0, x1 + rx - x, x - (x2 - rx))
        dy = max(0, y1 + rx - y, y - (y2 - rx))
        if dx * dx + dy * dy > rx * rx:
            row[x * 4 + 3] = 0

def chunk(name, data):
    crc = zlib.crc32(name + data) & 0xffffffff
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

ihdr = struct.pack('>II5B', width, height, 8, 6, 0, 0, 0)
idat_raw = b''.join(b'\x00' + bytes(row) for row in rows)
png = (
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', ihdr)
    + chunk(b'IDAT', zlib.compress(idat_raw, 6))
    + chunk(b'IEND', b'')
)
out.write_bytes(png)
shutil.copyfile(out, copy)
print(f'corner_alpha={rows[0][3]} center_alpha={rows[512][512 * 4 + 3]}')
PY
```

Expected: 最后一行输出 `corner_alpha=0 center_alpha=255`。

- [ ] **Step 3: 验证尺寸与目检**

Run: `sips -g pixelWidth -g pixelHeight build/icon.png && open build/icon.png`
Expected: `pixelWidth: 1024`、`pixelHeight: 1024`;目检为白底新图形、四角透明。

- [ ] **Step 4: Commit**

```bash
git add build/icon.png src-tauri/icons/icon.png
git commit -m "feat(icon): 导出新图标 1024px PNG"
```

---

### Task 3: 重新生成 Tauri 全尺寸图标(icns / ico / 多尺寸 PNG)

**Files:**
- Modify: `src-tauri/icons/32x32.png`
- Modify: `src-tauri/icons/128x128.png`
- Modify: `src-tauri/icons/128x128@2x.png`
- Modify: `src-tauri/icons/icon.icns`
- Modify: `src-tauri/icons/icon.ico`
- Modify: `src-tauri/icons/icon.png`(会被 `tauri icon` 重新编码覆盖,内容等价)

**Interfaces:**
- Consumes: `build/icon.png`(Task 2 产物)。
- Produces: `src-tauri/tauri.conf.json` 的 `bundle.icon` 列表引用的全部 5 个文件,内容为新图标。

- [ ] **Step 1: 运行 tauri icon 生成全尺寸**

Run: `npx tauri icon build/icon.png`
Expected: 退出码 0,日志逐行显示生成 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`、`icon.png` 及若干 `Square*Logo.png`/`StoreLogo.png`。

- [ ] **Step 2: 清理本项目不使用的 Windows Store 产物**

`tauri.conf.json` 的 `bundle.icon` 只引用 5 个文件,`Square*`/`StoreLogo` 系列不在其中,且旧版图标目录里也没有这些文件,删除以保持目录原状:

```bash
rm -f src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png
```

Run: `ls src-tauri/icons/`
Expected: 恰好 6 个文件:`32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`、`icon.png`。

- [ ] **Step 3: 验证生成产物**

```bash
sips -g pixelWidth src-tauri/icons/32x32.png
sips -g pixelWidth src-tauri/icons/128x128@2x.png
file src-tauri/icons/icon.icns src-tauri/icons/icon.ico
git status --short src-tauri/icons/
```

Expected: `32x32.png` 宽 32;`128x128@2x.png` 宽 256;`file` 输出分别含 `Mac OS X icon` 与 `MS Windows icon resource`;`git status` 显示 6 个文件均为已修改(`M`)。可用 `qlmanage -p src-tauri/icons/icon.icns` 目检各尺寸,确认 16px 下墨干与金点仍可分辨。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat(icon): 重新生成 icns/ico 与多尺寸 PNG"
```

---

### Task 4: 更新图标设计文档

**Files:**
- Modify: `docs/design/APP_ICON.md`(仅开头两节;Geometry 表、Source Files 表、Export 一节保持不变)

**Interfaces:**
- Consumes: 无(纯文档)。
- Produces: 与新图标一致的设计说明,供后续维护者参考。

- [ ] **Step 1: 替换 Design Direction 一节**

将 `docs/design/APP_ICON.md` 中从 `## Design Direction` 起、到 `## Geometry` 之前的全部内容,替换为:

```markdown
## Design Direction

The icon should read as a minimal note-taking / knowledge-base tool in the
Dock, not as a generic letter badge.

- Base: white squircle with a faint warm-gray hairline (`#E7E3D9`), inset
  2px so the 4px stroke survives the transparent corner clip.
- Symbol: a rounded ink bar (`#1E1C17`) as the margin line, with three
  solid gold dots (`#C79A3B`) — two riding the bar, one to the right —
  joined by two gold arcs. The linked dots read as connected notes.
- Palette: exactly four values — `#FFFFFF`, `#E7E3D9`, `#1E1C17`,
  `#C79A3B`. No gradients, no shadows, no filters.
- Style reference: VS Code's single bold centered glyph on a plain base.
  Spec: `docs/superpowers/specs/2026-07-11-app-icon-redesign-design.md`.
```

- [ ] **Step 2: 校对文档其余部分**

Run: `grep -n "fold\|gold vertical margin guide\|Obsidian" docs/design/APP_ICON.md`
Expected: 无输出(旧方案的折角、页边线、Obsidian 参照描述已全部随 Design Direction 一节移除)。若 Geometry 一节的 `88px` 安全区说明中仍提及 Obsidian 参照,保留该句——它解释的是安全区数值来源,与视觉方案无关;此时 grep 允许命中该行,但不得命中 Design Direction 一节内的行。

- [ ] **Step 3: Commit**

```bash
git add docs/design/APP_ICON.md
git commit -m "docs(icon): 更新图标设计文档为白底旁注节点方案"
```

---

### Task 5: 清理无引用的历史 icns 遗留文件

**Files:**
- Delete: `release/.icon-icns/icon.icns`

**Interfaces:**
- Consumes: 无。
- Produces: 无(纯清理)。

背景:该文件是早期打包流程的遗留,已被 `.gitignore` 匹配但仍在 git 追踪中;`scripts/`、`package.json`、`tauri.conf.json` 均无任何引用(已核实)。保留它只会让旧图标继续存在于仓库里。

- [ ] **Step 1: 再次确认无引用**

Run: `grep -rn "icon-icns" --include="*.json" --include="*.sh" --include="*.mjs" --include="*.ts" --include="*.toml" . | grep -v node_modules | grep -v .worktrees`
Expected: 无输出。若有输出,停止本任务并上报,不要删除。

- [ ] **Step 2: 从 git 移除**

```bash
git rm -r release/.icon-icns
```

Run: `git status --short`
Expected: 仅 `D  release/.icon-icns/icon.icns` 一条。

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(icon): 移除无引用的历史 icns 遗留文件"
```

---

### Task 6: 端到端验收

**Files:**
- 无新增/修改(纯验证)。

**Interfaces:**
- Consumes: Task 1–3 全部产物。

- [ ] **Step 1: 运行既有测试套件确认无回归**

Run: `npx vitest run`
Expected: 全部测试 PASS(图标改动不触碰任何被测代码,失败即说明环境或改动越界)。

- [ ] **Step 2: Dock 实机目检**

Run: `pnpm build:adhoc`(约数分钟;若本机无法完成打包,改用 `qlmanage -p src-tauri/icons/icon.icns` 目检并说明)
Expected: 构建成功后打开生成的 `.app`,Dock 中图标为白底新图形;在浅色与深色桌面下均清晰可辨,白底未与背景融为一体。

- [ ] **Step 3: 对照规格验收标准逐条确认**

对照 `docs/superpowers/specs/2026-07-11-app-icon-redesign-design.md` 的「验收标准」:

- `corner_alpha=0 center_alpha=255`(Task 2 已验)
- 深/浅桌面清晰可辨(Step 2 已验)
- 16px 下主干与节点可分辨(Task 3 Step 3 已验)
- 无渐变投影、颜色数 ≤ 3(不含底描边)(Task 1 SVG 内容即是证明)

全部满足则本计划完成;任何一条不满足,回到对应任务修正后重新验证。
