# Margin App Icon — 生成规范与约束

本文档记录 Margin 应用图标的设计规格、生成流程及已知陷阱，确保图标在 macOS Dock 中与系统内置应用视觉对齐。

---

## 1. 设计规格

| 属性 | 值 |
|------|----|
| 画布尺寸 | `1024 × 1024 px`，RGBA（含透明通道） |
| Squircle 位置 | `x=50, y=50, width=924, height=924` |
| 圆角半径 | `rx=207`（≈ squircle 宽度的 22.4%） |
| 画布边距 | 四周各 `50px` 透明区域 |
| 背景渐变 | 顶部 `#d4a840` → 底部 `#b8882e`（线性，上到下） |
| 字形 | "M"，Georgia / Times New Roman serif，`font-size: 460`，`font-weight: 500` |
| 字形颜色 | `#1f1810` |
| 字形位置 | 画布中心 `(512, 512)`，水平+垂直居中 |

### 为什么 50px 边距？

`app.dock.setIcon()` 设置的 PNG 图标由 macOS **直接渲染**，不会自动裁切为 squircle（这与 `.icns` bundle 图标行为不同）。macOS 内置 ICNS 图标的 squircle 可视区域约占画布的 87–90%，四周有约 5% 透明安全区。50px 边距（≈ 4.9%）与系统图标对齐，使 Margin 图标在 Dock 中与其他应用大小一致。

---

## 2. 源文件

| 文件 | 用途 |
|------|------|
| `build/icon-square.svg` | 矢量源文件，无圆角的原始 SVG |
| `build/icon.png` | 最终输出，1024×1024 RGBA PNG（由下方脚本生成） |

### SVG 源文件（`build/icon-square.svg`）

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d4a840"/>
      <stop offset="100%" stop-color="#b8882e"/>
    </linearGradient>
  </defs>
  <rect x="50" y="50" width="924" height="924" rx="207" fill="url(#bg)"/>
  <text x="512" y="512" font-family="Georgia, 'Times New Roman', serif"
        font-size="460" font-weight="500" fill="#1f1810"
        text-anchor="middle" dominant-baseline="central">M</text>
</svg>
```

---

## 3. 生成流程

> **必须按顺序执行两步**，缺少第二步会导致圆角外出现白色不透明像素。

### 步骤 1：SVG → PNG（qlmanage）

```bash
qlmanage -t -s 1024 -o /tmp build/icon-square.svg
```

输出：`/tmp/icon-square.svg.png`

**已知问题：** `qlmanage` 将 squircle 圆角外的区域渲染为 `RGB(255,255,255) alpha=255`（不透明白色），而非透明。若直接使用该文件，Dock 图标会出现白色方形边框。

### 步骤 2：修复透明度（Python 脚本）

用下方脚本将圆角外的像素 alpha 强制设为 `0`：

```python
import struct, zlib

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
    if pa <= pb and pa <= pc: return a
    if pb <= pc: return b
    return c

with open('/tmp/icon-square.svg.png', 'rb') as f:
    raw = f.read()

pos = 8
idat_chunks = []
width = height = 0
while pos < len(raw):
    length = struct.unpack('>I', raw[pos:pos+4])[0]
    name = raw[pos+4:pos+8].decode('ascii', errors='replace')
    data = raw[pos+8:pos+8+length]
    if name == 'IHDR':
        width = struct.unpack('>I', data[0:4])[0]
        height = struct.unpack('>I', data[4:8])[0]
    elif name == 'IDAT':
        idat_chunks.append(data)
    pos += 12 + length
    if name == 'IEND':
        break

bpp = 4
stride = 1 + width * bpp
decompressed = zlib.decompress(b''.join(idat_chunks))

pixels = []
prev = bytearray(width * bpp)
for y in range(height):
    ft = decompressed[y * stride]
    row = bytearray(decompressed[y*stride+1 : y*stride+stride])
    if ft == 1:
        for i in range(bpp, len(row)):
            row[i] = (row[i] + row[i-bpp]) & 0xFF
    elif ft == 2:
        for i in range(len(row)):
            row[i] = (row[i] + prev[i]) & 0xFF
    elif ft == 3:
        for i in range(len(row)):
            a = row[i-bpp] if i >= bpp else 0
            row[i] = (row[i] + (a + prev[i]) // 2) & 0xFF
    elif ft == 4:
        for i in range(len(row)):
            a = row[i-bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i-bpp] if i >= bpp else 0
            row[i] = (row[i] + paeth(a, b, c)) & 0xFF
    pixels.append(bytearray(row))
    prev = bytearray(row)

# Squircle: x1=50, y1=50, x2=974, y2=974, rx=207
x1, y1, x2, y2, rx = 50, 50, 974, 974, 207
for y in range(height):
    row = pixels[y]
    for x in range(width):
        dx = max(0, x1 + rx - x, x - (x2 - rx))
        dy = max(0, y1 + rx - y, y - (y2 - rx))
        if dx*dx + dy*dy > rx*rx:
            row[x*4+3] = 0  # transparent

def chunk(name, data):
    crc = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

ihdr = struct.pack('>II5B', width, height, 8, 6, 0, 0, 0)
idat_raw = b''.join(b'\x00' + bytes(row) for row in pixels)
out = (b'\x89PNG\r\n\x1a\n' +
       chunk(b'IHDR', ihdr) +
       chunk(b'IDAT', zlib.compress(idat_raw, 6)) +
       chunk(b'IEND', b''))

with open('build/icon.png', 'wb') as f:
    f.write(out)

print(f"Corner(0,0) alpha={pixels[0][3]}  →  expect 0")
print(f"Center(512,512) alpha={pixels[512][512*4+3]}  →  expect 255")
```

验证输出应为：
```
Corner(0,0) alpha=0  →  expect 0
Center(512,512) alpha=255  →  expect 255
```

---

## 4. 已知陷阱

### 陷阱 1：qlmanage 渲染背景不透明

**现象：** 即使 SVG 本身 squircle 外无填充，qlmanage 输出的 PNG 圆角外像素 alpha=255（白色）。  
**原因：** qlmanage 在渲染时叠加了白色背景。  
**修复：** 必须执行步骤 2 的 Python 脚本将圆角外 alpha 清零。

### 陷阱 2：`app.dock.setIcon()` 不应用 macOS squircle 遮罩

**现象：** 如果提供一张填满画布的方形 PNG，Dock 图标显示为方形，无圆角。  
**原因：** `app.dock.setIcon(image)` 直接使用图像原样显示；macOS 的 squircle 遮罩**仅**对 `.app` bundle 内的 `AppIcon.icns` 生效。  
**修复：** 在 PNG 中预先烘焙圆角（squircle 外像素 alpha=0）。

### 陷阱 3：多实例导致 Dock 出现多个图标

**现象：** 开发环境多次重启后 Dock 出现多个 M 图标。  
**原因：** 旧 Electron 进程未被完全终止。  
**修复：** 重启前执行：
```bash
kill $(ps aux | grep "Electron.app/Contents/MacOS/Electron \." | grep -v grep | awk '{print $2}') 2>/dev/null
kill $(ps aux | grep "electron-vite" | grep -v grep | awk '{print $2}') 2>/dev/null
```

### 陷阱 4：macOS 菜单栏标题在开发模式下显示 "Electron"

**现象：** 开发模式（`npm run dev`）下，菜单栏左上角显示 "Electron" 而非 "Margin"。  
**原因：** 菜单栏应用名称取自 Electron 可执行文件的 `CFBundleName`，开发环境读取的是 `node_modules/electron/dist/Electron.app`。  
**修复：** 打包后（`npm run build`）将使用 `productName: "Margin"` 的 bundle，菜单栏会正确显示 "Margin"。自定义 `Menu.buildFromTemplate()` 确保子菜单项已正确命名。

---

## 5. 在 `src/main/index.ts` 中的集成

```ts
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../../build/icon.png')
    if (app.dock) app.dock.setIcon(nativeImage.createFromPath(iconPath))

    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Margin',
          submenu: [
            { role: 'about', label: '关于 Margin' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide', label: '隐藏 Margin' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit', label: '退出 Margin' }
          ]
        },
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ])
    )
  }
  // ...
})
```
