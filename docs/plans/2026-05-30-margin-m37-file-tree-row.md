# Margin M3.7 (File-Tree Row Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current SwiftUI-default `List + Label` rendering in `FileTreeView` with a fully styled custom row that matches the redesign mockup: 24pt rows, gold .md icon, folder badge, accent-soft selection background with accent-line border, hover bg, dotfile dimming. Expand/collapse state moves from the system's `DisclosureGroup` to an explicit `@State var expandedURLs: Set<URL>` so we control the chevron and animation.

**Architecture:**
- A pure value type `FileTreeRow` (presentation only) — chevron / icon / name / badge / chrome.
- A pure function `VaultTreeFlatten.flatten(nodes:expanded:)` walks the tree and produces an ordered array of `RowDescriptor` values with depth + visibility + ignored flag + direct-child count. Fully testable.
- `FileTreeView` becomes a `ScrollView { LazyVStack }` driven by the flattened array, with tap and chevron actions updating `AppState` and the local expand set respectively.

**Tech Stack:** Swift 5.10+, SwiftUI on macOS 14, XCTest. No new dependencies.

**Spec:** [`2026-05-30-margin-editor-redesign.md`](../specs/2026-05-30-margin-editor-redesign.md) §5.

**Repo location:** `/Users/jianjustin/workspaces/margin`. Baseline at start of M3.7: `ed273cf`.

**Scope notes:**
- Folder direct-child counts (the right-side badge) include both subfolders and notes. Recursive counts are an M7 concern.
- "Ignored" in M3.7 means a leading-dot name (`.obsidian`, `.DS_Store`, etc.). The configurable ignore-glob system is M7. Ignored rows render with opacity 0.42 but are still visible — hide-toggle ships in M7.
- Per-extension icon colors (`.md` accent, `.canvas` blue, `.json` faint) are wired even though VaultScanner currently surfaces only `.md` files. They'll light up once VaultScanner is extended in a later milestone.
- The existing `rescan` toolbar button stays as-is (`ToolbarItem(placement: .primaryAction)`). Whether it visually appears depends on `NavigationSplitView`'s sidebar toolbar behavior under the custom transparent title bar; that's not in M3.7 scope.
- Selection drives off `AppState`: tapping a folder calls `selectFolder(url)`; tapping a note calls `openNote(url)`. A row is "selected" if its URL equals `state.selectedNoteURL` (for notes) or `state.selectedFolder` (for folders).

---

## File Structure (after M3.7 complete)

```
margin/
├── Sources/Margin/
│   └── UI/
│       ├── FileTreeView.swift           # REWRITE: drop List, ScrollView+LazyVStack
│       ├── FileTreeRow.swift            # NEW: pure presentation row
│       └── VaultTreeFlatten.swift       # NEW: flatten(nodes:expanded:) -> [RowDescriptor]
└── Tests/MarginTests/
    └── VaultTreeFlattenTests.swift      # NEW
```

---

## Conventions

- Run commands from `/Users/jianjustin/workspaces/margin`. Run `xcodegen` after creating Swift files.
- Tests use XCTest. Run via `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/<ClassName>`.
- Commit at the end of each task.
- TDD where applicable: `VaultTreeFlatten` is pure → TDD. `FileTreeRow` + `FileTreeView` are view code → no unit tests, covered by M3.7 verification doc.

---

## Task 1: VaultTreeFlatten.swift — pure flatten + tests

**Files:**
- Create: `Sources/Margin/UI/VaultTreeFlatten.swift`
- Create: `Tests/MarginTests/VaultTreeFlattenTests.swift`

Define `RowDescriptor` (URL, depth, isFolder, isIgnored, childCount, isExpanded) and a pure flatten function that, given the top-level `[VaultNode]` tree and the set of expanded folder URLs, returns the visible rows in display order. Folder rows always appear; their children appear only if the folder is expanded.

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/VaultTreeFlattenTests.swift`:

```swift
import XCTest
@testable import Margin

final class VaultTreeFlattenTests: XCTestCase {

    private func folder(_ name: String, _ children: [VaultNode] = []) -> VaultNode {
        .folder(url: URL(fileURLWithPath: "/v/\(name)"), children: children)
    }
    private func note(_ name: String, at parent: String = "/v") -> VaultNode {
        .note(url: URL(fileURLWithPath: "\(parent)/\(name).md"))
    }

    func testFlatTreeOneLevel() {
        let nodes: [VaultNode] = [note("a"), note("b")]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].depth, 0)
        XCTAssertEqual(rows[0].isFolder, false)
        XCTAssertEqual(rows[0].name, "a")
    }

    func testCollapsedFolderHidesChildren() {
        let nodes: [VaultNode] = [folder("notes", [note("a", at: "/v/notes")])]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].isFolder, true)
        XCTAssertEqual(rows[0].isExpanded, false)
        XCTAssertEqual(rows[0].childCount, 1)
    }

    func testExpandedFolderShowsChildren() {
        let folderURL = URL(fileURLWithPath: "/v/notes")
        let nodes: [VaultNode] = [folder("notes", [note("a", at: "/v/notes")])]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [folderURL])
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[1].depth, 1)
        XCTAssertEqual(rows[1].name, "a")
    }

    func testNestedExpansion() {
        let outer = URL(fileURLWithPath: "/v/outer")
        let inner = URL(fileURLWithPath: "/v/outer/inner")
        let tree: [VaultNode] = [
            .folder(url: outer, children: [
                .folder(url: inner, children: [
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/leaf.md"))
                ])
            ])
        ]
        let rows = VaultTreeFlatten.flatten(nodes: tree, expanded: [outer, inner])
        XCTAssertEqual(rows.map(\.depth), [0, 1, 2])
        XCTAssertEqual(rows.map(\.name), ["outer", "inner", "leaf"])
    }

    func testIgnoredFlagOnDotfileName() {
        let nodes: [VaultNode] = [
            folder(".obsidian"),
            note(".DS_Store"),
            note("regular")
        ]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertTrue(rows[0].isIgnored)
        XCTAssertTrue(rows[1].isIgnored)
        XCTAssertFalse(rows[2].isIgnored)
    }

    func testChildCountReflectsDirectChildrenOnly() {
        let inner = URL(fileURLWithPath: "/v/outer/inner")
        let tree: [VaultNode] = [
            .folder(url: URL(fileURLWithPath: "/v/outer"), children: [
                .folder(url: inner, children: [
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/a.md")),
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/b.md"))
                ]),
                .note(url: URL(fileURLWithPath: "/v/outer/c.md"))
            ])
        ]
        let rows = VaultTreeFlatten.flatten(nodes: tree, expanded: [])
        // outer has 2 direct children: the `inner` folder and `c` note
        XCTAssertEqual(rows[0].childCount, 2)
    }
}
```

- [ ] **Step 2:** Verify the tests fail (build error).

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/VaultTreeFlattenTests -quiet 2>&1 | tail -5`
Expected: `cannot find 'VaultTreeFlatten'` error.

- [ ] **Step 3:** Implement `Sources/Margin/UI/VaultTreeFlatten.swift`:

```swift
import Foundation

/// One visible row in the file tree.
struct RowDescriptor: Equatable, Identifiable {
    let url: URL
    let depth: Int
    let isFolder: Bool
    let isExpanded: Bool
    let isIgnored: Bool
    let childCount: Int

    var id: URL { url }
    var name: String {
        isFolder ? url.lastPathComponent
                 : url.deletingPathExtension().lastPathComponent
    }
    var fileExtension: String { url.pathExtension.lowercased() }
}

/// Pure transformation: walk the tree, skip the subtree of any collapsed
/// folder, and tag dotfile rows as ignored.
enum VaultTreeFlatten {
    static func flatten(nodes: [VaultNode],
                        expanded: Set<URL>,
                        depth: Int = 0) -> [RowDescriptor] {
        var out: [RowDescriptor] = []
        for node in nodes {
            switch node {
            case .folder(let url, let children):
                let isExp = expanded.contains(url)
                out.append(RowDescriptor(
                    url: url,
                    depth: depth,
                    isFolder: true,
                    isExpanded: isExp,
                    isIgnored: isDotName(url),
                    childCount: children.count
                ))
                if isExp {
                    out.append(contentsOf: flatten(nodes: children,
                                                   expanded: expanded,
                                                   depth: depth + 1))
                }
            case .note(let url):
                out.append(RowDescriptor(
                    url: url,
                    depth: depth,
                    isFolder: false,
                    isExpanded: false,
                    isIgnored: isDotName(url),
                    childCount: 0
                ))
            }
        }
        return out
    }

    private static func isDotName(_ url: URL) -> Bool {
        url.lastPathComponent.hasPrefix(".")
    }
}
```

- [ ] **Step 4:** Run tests, expect all 6 to pass.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/VaultTreeFlattenTests 2>&1 | grep -E "(Test Suite|passed|failed|error:)" | head -15`
Expected: all 6 tests pass.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/UI/VaultTreeFlatten.swift Tests/MarginTests/VaultTreeFlattenTests.swift
git commit -m "feat(ui): VaultTreeFlatten — pure flatten of VaultNode tree to row descriptors"
```

---

## Task 2: FileTreeRow.swift — pure presentation

**Files:** Create `Sources/Margin/UI/FileTreeRow.swift`.

A SwiftUI view rendering one row. Inputs: `RowDescriptor`, `isSelected`, `isHovered`, and two callbacks (`onToggleExpand`, `onTap`). All chrome (background, border, opacity) computed from these inputs. No state.

- [ ] **Step 1:** Create `Sources/Margin/UI/FileTreeRow.swift`:

```swift
import SwiftUI

struct FileTreeRow: View {
    let row: RowDescriptor
    let isSelected: Bool
    let isHovered: Bool
    let onToggleExpand: () -> Void
    let onTap: () -> Void

    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 6) {
            // Indent + chevron
            Color.clear.frame(width: CGFloat(row.depth) * 16)
            chevron
            icon
            Text(row.name)
                .font(.system(size: 13,
                              weight: row.isFolder ? .semibold : .regular))
                .foregroundStyle(Color(theme.palette.text))
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 4)
            if row.isFolder, row.childCount > 0 {
                Text("\(row.childCount)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Color(theme.palette.textFaint))
                    .padding(.horizontal, 6)
                    .frame(height: 16)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(theme.palette.bg))
                    )
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 24)
        .background(rowBackground)
        .overlay(rowBorder)
        .contentShape(Rectangle())
        .opacity(row.isIgnored ? 0.42 : 1.0)
        .onTapGesture(perform: onTap)
    }

    @ViewBuilder
    private var chevron: some View {
        if row.isFolder {
            Button(action: onToggleExpand) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Color(theme.palette.textFaint))
                    .rotationEffect(.degrees(row.isExpanded ? 90 : 0))
                    .animation(.easeInOut(duration: 0.12), value: row.isExpanded)
                    .frame(width: 12, height: 12)
            }
            .buttonStyle(.plain)
        } else {
            Color.clear.frame(width: 12, height: 12)
        }
    }

    @ViewBuilder
    private var icon: some View {
        Image(systemName: iconSystemName)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Color(iconColor))
            .frame(width: 17, height: 17)
    }

    private var iconSystemName: String {
        if row.isFolder { return "folder.fill" }
        switch row.fileExtension {
        case "md": return "doc.text"
        case "canvas": return "square.grid.2x2"
        case "json": return "curlybraces"
        default: return "doc"
        }
    }

    private var iconColor: NSColor {
        if row.isFolder { return theme.palette.accent }
        switch row.fileExtension {
        case "md": return theme.palette.accent
        case "canvas": return NSColor(red: 0x4A/255, green: 0x90/255, blue: 0xE2/255, alpha: 1)
        case "json": return theme.palette.textFaint
        default: return theme.palette.textFaint
        }
    }

    @ViewBuilder
    private var rowBackground: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 6).fill(Color(theme.palette.accentSoft))
        } else if isHovered {
            RoundedRectangle(cornerRadius: 6).fill(Color(theme.palette.bgHover))
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private var rowBorder: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color(theme.palette.accentLine), lineWidth: 1)
        }
    }
}
```

- [ ] **Step 2:** Build — confirm it compiles.

Run: `xcodegen >/dev/null && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3:** Commit.

```bash
git add Sources/Margin/UI/FileTreeRow.swift
git commit -m "feat(ui): FileTreeRow — 24pt styled row matching M3.7 mockup"
```

---

## Task 3: FileTreeView — drop List, wire LazyVStack + tap + expand

**Files:** Modify `Sources/Margin/UI/FileTreeView.swift`.

Replace the `List + DisclosureGroup + Label` body with a `ScrollView + LazyVStack` of `FileTreeRow`. Local `@State var expandedURLs: Set<URL>` tracks expansion. Hover state per-row via `.onHover`. Selection drives off `AppState`.

- [ ] **Step 1:** Replace `Sources/Margin/UI/FileTreeView.swift` entirely with:

```swift
import SwiftUI

struct FileTreeView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore
    @State private var expandedURLs: Set<URL> = []
    @State private var hoveredURL: URL? = nil

    private var rows: [RowDescriptor] {
        VaultTreeFlatten.flatten(nodes: state.tree, expanded: expandedURLs)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 1) {
                ForEach(rows) { row in
                    FileTreeRow(
                        row: row,
                        isSelected: isSelected(row),
                        isHovered: hoveredURL == row.url,
                        onToggleExpand: { toggleExpand(row.url) },
                        onTap: { handleTap(row) }
                    )
                    .environmentObject(theme)
                    .onHover { hovering in
                        if hovering { hoveredURL = row.url }
                        else if hoveredURL == row.url { hoveredURL = nil }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
        .background(Color(theme.palette.bgPanel))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    state.rescan()
                } label: { Image(systemName: "arrow.clockwise") }
                .help("Rescan vault")
            }
        }
    }

    private func isSelected(_ row: RowDescriptor) -> Bool {
        if row.isFolder {
            return state.selectedFolder == row.url
        } else {
            return state.selectedNoteURL == row.url
        }
    }

    private func toggleExpand(_ url: URL) {
        if expandedURLs.contains(url) { expandedURLs.remove(url) }
        else { expandedURLs.insert(url) }
    }

    private func handleTap(_ row: RowDescriptor) {
        if row.isFolder {
            // Tapping a folder both selects it and toggles its expansion.
            state.selectFolder(row.url)
            toggleExpand(row.url)
        } else {
            state.openNote(row.url)
        }
    }
}
```

- [ ] **Step 2:** Build + run the full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 93 tests pass (87 baseline + 6 new VaultTreeFlattenTests).

- [ ] **Step 3:** Commit.

```bash
git add Sources/Margin/UI/FileTreeView.swift
git commit -m "feat(ui): FileTreeView — ScrollView+LazyVStack with custom rows"
```

---

## Task 4: Manual smoke verification

**Files:** Create `docs/M3.7-verification.md`.

- [ ] **Step 1:** Write `docs/M3.7-verification.md`:

```markdown
# M3.7 — File-tree row polish verification

Run `xcodegen && open Margin.xcodeproj`, build & launch, open a vault with at least one folder.

## Row visuals
- [ ] Each row is ~24pt tall; rows are tightly packed (1pt gap)
- [ ] Folder rows show a chevron pointing right (collapsed) or down (expanded)
- [ ] File rows have no chevron, just a 12pt gutter
- [ ] `.md` files show `doc.text` icon in warm gold
- [ ] Folder rows show `folder.fill` icon in warm gold
- [ ] Folder name is semibold; file name is regular
- [ ] Each indent level adds 16pt of leading space

## Folder badge
- [ ] A folder with N direct children shows `N` in a rounded mono pill on the right
- [ ] Empty folders show no badge

## Selection
- [ ] Tapping a `.md` row loads the note AND draws an accent-soft background + 1pt accent-line border
- [ ] Tapping a folder selects it AND toggles its expansion (chevron rotates 90°)
- [ ] At most one row at a time shows the selection chrome

## Hover
- [ ] Moving the mouse over a row paints a faint bg-hover background (unless the row is already selected)
- [ ] Moving away clears the hover

## Ignored
- [ ] `.obsidian` / `.DS_Store` / any leading-dot file or folder renders at ~42% opacity
- [ ] Ignored rows are still clickable and selectable

## Regressions
- [ ] M3.6 TitleBar breadcrumb still updates when you switch notes via the tree
- [ ] M3.6 StatusBar counters refresh after the 200ms debounce
- [ ] M3.5 active-paragraph rendering still works

## Unit tests
Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
- [ ] All tests pass (VaultTreeFlatten + StatsCalculator + M3.5 + M1–M3)
```

- [ ] **Step 2:** Sanity-run automated checks:
   - `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3` → 93 tests pass.
   - `grep -rn "DisclosureGroup" Sources/` → should be empty (the old expand UI is gone).

- [ ] **Step 3:** Commit.

```bash
git add docs/M3.7-verification.md
git commit -m "docs: M3.7 verification checklist"
```

---

## Self-review checklist

After every task lands, verify:
- **Spec coverage:** §5 → Tasks 2-3. Row height 24pt, indent 16/level, chevron, icons + per-ext colors, name weights, badge, selected, hover, ignored.
- **No List residue:** `grep -rn "DisclosureGroup\|listStyle\|listRowBackground" Sources/UI/FileTreeView.swift` returns nothing.
- **Type consistency:** `RowDescriptor`, `VaultTreeFlatten`, `FileTreeRow` names used consistently across tasks.

After M3.7 lands, M3.8 (block-level editor chrome — TextKit 2 fragments, hover handle, quote bar, code header) is the last visual redesign milestone.
