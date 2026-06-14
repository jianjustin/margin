# Margin App Icon

This document records the Margin app icon source, visual direction, and export flow.

## Design Direction

The icon should read as a focused writing tool in the Dock, not as a generic
letter badge.

- Base: macOS-style dark squircle, matching Margin's quiet dark UI.
- Symbol: a warm document surface with a folded page corner.
- Brand cue: a gold vertical margin guide, using the product accent color family.
- Reference posture: Obsidian's icon was used only as a quality reference for a
  dark base, large centered subject, dimensional facets, and soft shadow. Margin
  should remain visually distinct and avoid Obsidian's purple crystal silhouette.

## Geometry

| Attribute | Value |
| --- | --- |
| Canvas | `1024 x 1024 px`, RGBA |
| Squircle | `x=88, y=88, width=848, height=848` |
| Squircle radius | `rx=190` |
| Transparent safe area | `88px` on each side |
| Main source | `build/icon-square.svg` |
| Convenience source | `build/icon.svg` |
| Runtime PNG | `build/icon.png` |
| Tauri bundle PNG | `src-tauri/icons/icon.png` |

The `88px` safe area matches the visible coverage of the Obsidian `.icns`
reference (`849px` wide non-transparent bounds on a 1024px canvas). A smaller
safe area makes the direct PNG render oversized in the Dock.

## Source Files

| File | Purpose |
| --- | --- |
| `build/icon-square.svg` | Canonical SVG source for the icon |
| `build/icon.svg` | Same artwork, kept for tools that expect this path |
| `build/icon.png` | Exported 1024px PNG with transparent corners |
| `src-tauri/icons/icon.png` | Tauri bundle icon referenced by `tauri.conf.json` |

## Export

Render the SVG through Quick Look:

```bash
qlmanage -t -s 1024 -o /tmp build/icon-square.svg
```

Quick Look may render transparent SVG canvas pixels as opaque white. After
rendering, force all pixels outside the baked squircle to alpha `0`, then copy
the result to both PNG destinations:

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

Expected validation:

```text
corner_alpha=0 center_alpha=255
```
