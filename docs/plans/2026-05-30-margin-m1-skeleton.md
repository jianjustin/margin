# Margin M1 (Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runnable macOS app called **Margin** with a three-pane shell, vault folder picker, file tree (showing hidden files), note list, plain-text editor that reads/writes `.md` files, auto-save, and persistent window state. No Markdown rendering, no index, no double-links yet — those come in M2+.

**Architecture:** Swift Package–driven macOS app. XcodeGen generates `Margin.xcodeproj` from `project.yml`. SwiftUI `App` lifecycle + `NavigationSplitView` for the three-pane shell. AppKit `NSTextView` wrapped via `NSViewRepresentable` for the editor (kept minimal in M1; will grow in M3). Vault root is selected at first launch and persisted as a security-scoped bookmark (sandbox stays **off** since this is personal-use software, but the bookmark pattern is used anyway so we can flip sandbox on later without changing the data model).

**Tech Stack:** Swift 5.10+, Xcode 15+ targeting macOS 14, XcodeGen 2.x, SwiftUI + AppKit. No third-party libraries in M1.

**Spec:** [`2026-05-30-bear-obsidian-mac-editor-design.md`](../specs/2026-05-30-bear-obsidian-mac-editor-design.md)

**Repo location:** `/Users/jianjustin/workspaces/margin`

---

## File Structure (after M1 complete)

```
margin/
├── .gitignore
├── README.md
├── project.yml                          # XcodeGen config (source of truth)
├── Margin.xcodeproj                     # generated, NOT checked in (in .gitignore)
├── Sources/
│   └── Margin/
│       ├── MarginApp.swift              # @main App entry point
│       ├── AppState.swift               # ObservableObject root state
│       ├── Models/
│       │   ├── VaultNode.swift          # tree node (folder | note)
│       │   └── Note.swift               # in-memory note representation
│       ├── Vault/
│       │   ├── VaultPicker.swift        # NSOpenPanel + security-scoped bookmark persistence
│       │   ├── VaultScanner.swift       # recursive directory scan → [VaultNode]
│       │   └── FileIO.swift             # async read/write .md content
│       ├── UI/
│       │   ├── RootView.swift           # three-pane NavigationSplitView
│       │   ├── FileTreeView.swift       # left pane: folder tree, hidden files visible
│       │   ├── NoteListView.swift       # middle pane: notes in selected folder
│       │   ├── EditorView.swift         # right pane: NSTextView wrapper
│       │   └── EmptyStates.swift        # "no vault selected" / "no note selected" placeholders
│       └── Persistence/
│           └── UserDefaultsKeys.swift   # all UserDefaults string keys in one place
├── Tests/
│   └── MarginTests/
│       ├── VaultScannerTests.swift
│       ├── NoteTests.swift
│       └── FileIOTests.swift
└── docs/
    └── M1-verification.md               # manual verification checklist
```

**Files modified across tasks:** Most files are created in a single task and not touched again in M1. Exceptions noted per-task.

---

## Conventions

- Commit message style: `<type>: <subject>` where type ∈ {`feat`, `test`, `chore`, `refactor`, `fix`, `docs`}; subject in imperative present tense.
- Every task ends with a commit step.
- TDD applies to non-UI logic (Vault, Models, FileIO). SwiftUI views are verified by manual smoke at the end of M1.
- Test runner: `swift test` (works against the SPM target). XCTest framework.
- Build verification: `xcodebuild -scheme Margin -destination "platform=macOS" build`.
- Working directory for all bash commands: `/Users/jianjustin/workspaces/margin` unless otherwise stated.

---

## Task 1: Initialize repo and tooling

**Files:**
- Create: `/Users/jianjustin/workspaces/margin/.gitignore`
- Create: `/Users/jianjustin/workspaces/margin/README.md`

- [ ] **Step 1: Verify XcodeGen and Xcode are available**

Run:
```bash
which xcodegen || brew install xcodegen
xcodebuild -version
swift --version
```

Expected: XcodeGen 2.x, Xcode 15+, Swift 5.10+. If any missing, install before continuing.

- [ ] **Step 2: Create workspace directory and init git**

Run:
```bash
mkdir -p /Users/jianjustin/workspaces/margin
cd /Users/jianjustin/workspaces/margin
git init -b main
```

- [ ] **Step 3: Write `.gitignore`**

Create `/Users/jianjustin/workspaces/margin/.gitignore`:
```
# Xcode
*.xcodeproj/
*.xcworkspace/
xcuserdata/
DerivedData/
build/
.swiftpm/

# macOS
.DS_Store

# SPM
Package.resolved
.build/

# Generated
Margin.xcodeproj
```

- [ ] **Step 4: Write minimal `README.md`**

Create `/Users/jianjustin/workspaces/margin/README.md`:
```markdown
# Margin

A native macOS Markdown editor for Obsidian vaults — Bear typography, Obsidian data model.

## Build

```bash
xcodegen
open Margin.xcodeproj
```

## Status

M1 — skeleton in progress. See `docs/superpowers/plans/` in the parent vault.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jianjustin/workspaces/margin
git add .gitignore README.md
git commit -m "chore: init repo with gitignore and readme"
```

---

## Task 2: XcodeGen project + first successful build

**Files:**
- Create: `project.yml`
- Create: `Sources/Margin/MarginApp.swift`
- Create: `Tests/MarginTests/Sanity.swift`

- [ ] **Step 1: Write `project.yml`**

Create `/Users/jianjustin/workspaces/margin/project.yml`:
```yaml
name: Margin
options:
  bundleIdPrefix: com.jianjustin
  deploymentTarget:
    macOS: "14.0"
  developmentLanguage: en
settings:
  base:
    SWIFT_VERSION: "5.10"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
    CODE_SIGN_STYLE: Automatic
    CODE_SIGN_IDENTITY: "-"
    ENABLE_HARDENED_RUNTIME: NO
    ENABLE_APP_SANDBOX: NO
targets:
  Margin:
    type: application
    platform: macOS
    sources:
      - path: Sources/Margin
    info:
      path: Sources/Margin/Info.plist
      properties:
        CFBundleDisplayName: Margin
        CFBundleShortVersionString: "0.1.0"
        CFBundleVersion: "1"
        LSMinimumSystemVersion: "14.0"
        NSHumanReadableCopyright: "Personal use"
        NSPrincipalClass: NSApplication
    scheme:
      testTargets:
        - MarginTests
  MarginTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - path: Tests/MarginTests
    dependencies:
      - target: Margin
```

- [ ] **Step 2: Create app entry point**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/MarginApp.swift`:
```swift
import SwiftUI

@main
struct MarginApp: App {
    var body: some Scene {
        WindowGroup("Margin") {
            Text("Margin – M1 skeleton")
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
    }
}
```

- [ ] **Step 3: Create a sanity test**

Create `/Users/jianjustin/workspaces/margin/Tests/MarginTests/Sanity.swift`:
```swift
import XCTest

final class SanityTests: XCTestCase {
    func testTwoPlusTwo() {
        XCTAssertEqual(2 + 2, 4)
    }
}
```

- [ ] **Step 4: Generate Xcode project and build**

Run:
```bash
cd /Users/jianjustin/workspaces/margin
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Run sanity test**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test
```

Expected: `Test Suite 'SanityTests' passed`.

- [ ] **Step 6: Commit**

```bash
git add project.yml Sources/ Tests/
git commit -m "feat: scaffold Margin app with XcodeGen and sanity test"
```

---

## Task 3: Define core models (TDD)

**Files:**
- Create: `Sources/Margin/Models/Note.swift`
- Create: `Sources/Margin/Models/VaultNode.swift`
- Create: `Tests/MarginTests/NoteTests.swift`

- [ ] **Step 1: Write failing tests for `Note`**

Create `/Users/jianjustin/workspaces/margin/Tests/MarginTests/NoteTests.swift`:
```swift
import XCTest
@testable import Margin

final class NoteTests: XCTestCase {
    func testTitleFromFilenameWhenNoFrontmatter() {
        let n = Note(url: URL(fileURLWithPath: "/v/Folder/My Note.md"), body: "Hello world")
        XCTAssertEqual(n.title, "My Note")
    }

    func testTitleFromFrontmatterWhenPresent() {
        let body = """
        ---
        title: Explicit Title
        tags: [a]
        ---
        Body here.
        """
        let n = Note(url: URL(fileURLWithPath: "/v/Folder/other.md"), body: body)
        XCTAssertEqual(n.title, "Explicit Title")
    }

    func testTitleFallsBackToFirstH1IfNoFrontmatterTitle() {
        let body = """
        # The First Heading
        Some text.
        """
        let n = Note(url: URL(fileURLWithPath: "/v/Folder/file.md"), body: body)
        XCTAssertEqual(n.title, "The First Heading")
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "(FAILED|error:|passed|failed)"
```

Expected: compile error — `Note` type not found.

- [ ] **Step 3: Implement `Note`**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Models/Note.swift`:
```swift
import Foundation

struct Note: Identifiable, Hashable {
    let url: URL
    let body: String

    var id: URL { url }
    var filename: String { url.deletingPathExtension().lastPathComponent }

    var title: String {
        if let fm = frontmatterTitle { return fm }
        if let h1 = firstH1 { return h1 }
        return filename
    }

    private var frontmatterTitle: String? {
        // Match a YAML frontmatter block at the top: --- ... ---
        guard body.hasPrefix("---") else { return nil }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return nil }
        var i = 1
        while i < lines.count, lines[i] != "---" {
            let line = lines[i]
            if let range = line.range(of: #"^\s*title\s*:\s*"#, options: .regularExpression) {
                var value = String(line[range.upperBound...])
                value = value.trimmingCharacters(in: .whitespaces)
                if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
                    value = String(value.dropFirst().dropLast())
                }
                return value.isEmpty ? nil : value
            }
            i += 1
        }
        return nil
    }

    private var firstH1: String? {
        for line in body.components(separatedBy: "\n") {
            if line.hasPrefix("# ") {
                return String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            }
            if line.hasPrefix("---") { continue }
        }
        return nil
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "(Test Case|passed|failed)"
```

Expected: all 3 `NoteTests` cases pass.

- [ ] **Step 5: Create `VaultNode`**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Models/VaultNode.swift`:
```swift
import Foundation

enum VaultNode: Identifiable, Hashable {
    case folder(url: URL, children: [VaultNode])
    case note(url: URL)

    var id: URL { url }

    var url: URL {
        switch self {
        case .folder(let u, _), .note(let u): return u
        }
    }

    var name: String { url.lastPathComponent }

    var isFolder: Bool {
        if case .folder = self { return true }
        return false
    }

    var children: [VaultNode]? {
        if case .folder(_, let c) = self { return c }
        return nil
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add Sources/Margin/Models Tests/MarginTests/NoteTests.swift
git commit -m "feat: add Note and VaultNode models with title resolution"
```

---

## Task 4: Vault scanner (TDD)

**Files:**
- Create: `Sources/Margin/Vault/VaultScanner.swift`
- Create: `Tests/MarginTests/VaultScannerTests.swift`

- [ ] **Step 1: Write failing tests**

Create `/Users/jianjustin/workspaces/margin/Tests/MarginTests/VaultScannerTests.swift`:
```swift
import XCTest
@testable import Margin

final class VaultScannerTests: XCTestCase {
    var tempDir: URL!

    override func setUpWithError() throws {
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func write(_ relPath: String, _ content: String = "") throws {
        let url = tempDir.appendingPathComponent(relPath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    func testScannerReturnsFlatNotes() throws {
        try write("a.md", "A")
        try write("b.md", "B")
        let tree = VaultScanner().scan(root: tempDir)
        let names = tree.map { $0.name }.sorted()
        XCTAssertEqual(names, ["a.md", "b.md"])
    }

    func testScannerIncludesHiddenDirectoriesByDefault() throws {
        try write(".obsidian/config.json", "{}")
        try write("regular.md", "x")
        let tree = VaultScanner().scan(root: tempDir)
        let names = tree.map { $0.name }.sorted()
        XCTAssertTrue(names.contains(".obsidian"), "Expected .obsidian to appear in tree, got \(names)")
        XCTAssertTrue(names.contains("regular.md"))
    }

    func testScannerRecursesIntoSubfolders() throws {
        try write("folder/inner.md", "I")
        let tree = VaultScanner().scan(root: tempDir)
        guard case let .folder(_, children)? = tree.first(where: { $0.name == "folder" }) else {
            XCTFail("Expected folder node"); return
        }
        XCTAssertEqual(children.map(\.name), ["inner.md"])
    }

    func testScannerSortsFoldersBeforeNotesThenAlpha() throws {
        try write("zeta.md", "")
        try write("alpha.md", "")
        try write("mid-folder/x.md", "")
        let names = VaultScanner().scan(root: tempDir).map(\.name)
        XCTAssertEqual(names, ["mid-folder", "alpha.md", "zeta.md"])
    }

    func testScannerIgnoresNonMarkdownFilesAtLeafLevel() throws {
        try write("note.md", "")
        try write("image.png", "")
        try write("data.json", "")
        let names = VaultScanner().scan(root: tempDir).map(\.name)
        XCTAssertEqual(names, ["note.md"])
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "(FAILED|error:|passed|failed)" | head -20
```

Expected: compile error — `VaultScanner` not found.

- [ ] **Step 3: Implement `VaultScanner`**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Vault/VaultScanner.swift`:
```swift
import Foundation

struct VaultScanner {
    /// Synchronous scan. For large vaults, call from a background queue.
    /// - Returns: root-level children, folders first then notes, each alphabetical.
    func scan(root: URL) -> [VaultNode] {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [] // do NOT pass .skipsHiddenFiles — hidden dirs must remain visible
        ) else {
            return []
        }

        var folders: [VaultNode] = []
        var notes: [VaultNode] = []

        for url in entries {
            let resolved = try? url.resourceValues(forKeys: [.isDirectoryKey])
            let isDir = resolved?.isDirectory ?? false
            if isDir {
                let children = scan(root: url)
                folders.append(.folder(url: url, children: children))
            } else if url.pathExtension.lowercased() == "md" {
                notes.append(.note(url: url))
            }
        }

        folders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        notes.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return folders + notes
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "(Test Case|passed|failed)" | tail -20
```

Expected: all 5 `VaultScannerTests` pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/Margin/Vault/VaultScanner.swift Tests/MarginTests/VaultScannerTests.swift
git commit -m "feat: implement vault scanner with hidden-file visibility"
```

---

## Task 5: File I/O (TDD)

**Files:**
- Create: `Sources/Margin/Vault/FileIO.swift`
- Create: `Tests/MarginTests/FileIOTests.swift`

- [ ] **Step 1: Write failing tests**

Create `/Users/jianjustin/workspaces/margin/Tests/MarginTests/FileIOTests.swift`:
```swift
import XCTest
@testable import Margin

final class FileIOTests: XCTestCase {
    var tempFile: URL!

    override func setUpWithError() throws {
        tempFile = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-iotest-\(UUID().uuidString).md")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempFile)
    }

    func testReadReturnsContent() throws {
        try "hello\nworld".write(to: tempFile, atomically: true, encoding: .utf8)
        XCTAssertEqual(try FileIO.read(tempFile), "hello\nworld")
    }

    func testWriteThenReadRoundTrip() throws {
        try FileIO.write("Round trip text", to: tempFile)
        XCTAssertEqual(try FileIO.read(tempFile), "Round trip text")
    }

    func testWriteIsAtomic() throws {
        try FileIO.write("first", to: tempFile)
        try FileIO.write("second", to: tempFile)
        XCTAssertEqual(try FileIO.read(tempFile), "second")
    }
}
```

- [ ] **Step 2: Confirm fail**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "error:" | head -5
```

Expected: `FileIO` not found.

- [ ] **Step 3: Implement `FileIO`**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Vault/FileIO.swift`:
```swift
import Foundation

enum FileIO {
    static func read(_ url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
    }

    static func write(_ content: String, to url: URL) throws {
        try content.write(to: url, atomically: true, encoding: .utf8)
    }
}
```

- [ ] **Step 4: Verify pass**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "passed|failed" | tail -5
```

Expected: all `FileIOTests` pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/Margin/Vault/FileIO.swift Tests/MarginTests/FileIOTests.swift
git commit -m "feat: add atomic file IO helpers"
```

---

## Task 6: Vault picker (security-scoped bookmark)

**Files:**
- Create: `Sources/Margin/Vault/VaultPicker.swift`
- Create: `Sources/Margin/Persistence/UserDefaultsKeys.swift`

(Vault picker uses NSOpenPanel which can't be reasonably unit-tested. Verification is manual.)

- [ ] **Step 1: Create UserDefaults keys**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Persistence/UserDefaultsKeys.swift`:
```swift
import Foundation

enum UserDefaultsKeys {
    static let vaultBookmark = "vaultBookmark"
    static let lastSelectedNotePath = "lastSelectedNotePath"
    static let windowFrame = "windowFrame"
    static let sidebarWidth = "sidebarWidth"
    static let noteListWidth = "noteListWidth"
}
```

- [ ] **Step 2: Create VaultPicker**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/Vault/VaultPicker.swift`:
```swift
import Foundation
import AppKit

enum VaultPickerError: Error {
    case userCancelled
    case bookmarkFailed
    case bookmarkResolveFailed
    case staleBookmark
}

struct VaultPicker {
    /// Show NSOpenPanel and let the user choose a vault root.
    /// Persists a security-scoped bookmark to UserDefaults.
    static func chooseVault() throws -> URL {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Vault"
        panel.message = "Select your Obsidian vault root directory."
        panel.title = "Select Vault"

        let response = panel.runModal()
        guard response == .OK, let url = panel.url else {
            throw VaultPickerError.userCancelled
        }

        try persistBookmark(for: url)
        return url
    }

    /// Persist a security-scoped bookmark so we can re-open the vault next launch
    /// without prompting (relevant when sandbox is later turned on).
    static func persistBookmark(for url: URL) throws {
        do {
            let data = try url.bookmarkData(
                options: [.withSecurityScope],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            UserDefaults.standard.set(data, forKey: UserDefaultsKeys.vaultBookmark)
        } catch {
            throw VaultPickerError.bookmarkFailed
        }
    }

    /// Resolve the previously-saved vault, if any.
    static func resolveStoredVault() throws -> URL? {
        guard let data = UserDefaults.standard.data(forKey: UserDefaultsKeys.vaultBookmark) else {
            return nil
        }
        var isStale = false
        let url: URL
        do {
            url = try URL(
                resolvingBookmarkData: data,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
        } catch {
            throw VaultPickerError.bookmarkResolveFailed
        }
        if isStale {
            throw VaultPickerError.staleBookmark
        }
        _ = url.startAccessingSecurityScopedResource()
        return url
    }

    static func clearStoredVault() {
        UserDefaults.standard.removeObject(forKey: UserDefaultsKeys.vaultBookmark)
    }
}
```

- [ ] **Step 3: Confirm build**

Run:
```bash
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add Sources/Margin/Vault/VaultPicker.swift Sources/Margin/Persistence
git commit -m "feat: add vault picker with security-scoped bookmarks"
```

---

## Task 7: App state and root view shell

**Files:**
- Create: `Sources/Margin/AppState.swift`
- Create: `Sources/Margin/UI/EmptyStates.swift`
- Create: `Sources/Margin/UI/RootView.swift`
- Modify: `Sources/Margin/MarginApp.swift`

- [ ] **Step 1: Create AppState**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/AppState.swift`:
```swift
import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var vaultRoot: URL?
    @Published var tree: [VaultNode] = []
    @Published var selectedFolder: URL?         // nil = root
    @Published var selectedNoteURL: URL?
    @Published var noteBody: String = ""
    @Published var dirty: Bool = false

    func loadStoredVault() {
        do {
            if let url = try VaultPicker.resolveStoredVault() {
                openVault(url: url)
            }
        } catch {
            // Stale or failed bookmark — user must pick again.
            VaultPicker.clearStoredVault()
        }
    }

    func chooseVault() {
        do {
            let url = try VaultPicker.chooseVault()
            openVault(url: url)
        } catch VaultPickerError.userCancelled {
            // no-op
        } catch {
            NSLog("Vault pick error: \(error)")
        }
    }

    func openVault(url: URL) {
        vaultRoot = url
        rescan()
    }

    func rescan() {
        guard let root = vaultRoot else { tree = []; return }
        tree = VaultScanner().scan(root: root)
    }

    func selectFolder(_ url: URL?) {
        selectedFolder = url
    }

    func openNote(_ url: URL) {
        // Save any pending changes before switching.
        if dirty, let current = selectedNoteURL {
            try? FileIO.write(noteBody, to: current)
            dirty = false
        }
        selectedNoteURL = url
        noteBody = (try? FileIO.read(url)) ?? ""
        dirty = false
    }

    func saveCurrent() {
        guard let url = selectedNoteURL else { return }
        try? FileIO.write(noteBody, to: url)
        dirty = false
    }

    func notesInSelectedFolder() -> [URL] {
        let folder = selectedFolder ?? vaultRoot
        guard let folder else { return [] }
        return collectNotes(in: tree, currentPath: vaultRoot, target: folder)
    }

    private func collectNotes(in nodes: [VaultNode], currentPath: URL?, target: URL) -> [URL] {
        // Return .md children of the folder matching `target`.
        if currentPath == target {
            return nodes.compactMap { if case .note(let u) = $0 { return u } else { return nil } }
        }
        for node in nodes {
            if case .folder(let url, let children) = node, target.path.hasPrefix(url.path) {
                if let hit = collectNotesIn(folderURL: url, children: children, target: target) {
                    return hit
                }
            }
        }
        return []
    }

    private func collectNotesIn(folderURL: URL, children: [VaultNode], target: URL) -> [URL]? {
        if folderURL == target {
            return children.compactMap { if case .note(let u) = $0 { return u } else { return nil } }
        }
        for node in children {
            if case .folder(let url, let nested) = node, target.path.hasPrefix(url.path) {
                if let hit = collectNotesIn(folderURL: url, children: nested, target: target) {
                    return hit
                }
            }
        }
        return nil
    }
}
```

- [ ] **Step 2: Create empty-state views**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/EmptyStates.swift`:
```swift
import SwiftUI

struct NoVaultView: View {
    let onChoose: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Text("Welcome to Margin")
                .font(.largeTitle)
            Text("Choose a vault folder to begin.")
                .foregroundStyle(.secondary)
            Button("Choose Vault…", action: onChoose)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
        }
        .padding(40)
    }
}

struct NoNoteSelectedView: View {
    var body: some View {
        Text("Select a note")
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

- [ ] **Step 3: Create placeholder RootView (real three-pane comes in Task 8)**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/RootView.swift`:
```swift
import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Group {
            if state.vaultRoot == nil {
                NoVaultView(onChoose: state.chooseVault)
            } else {
                ThreePaneView()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
    }
}

// Placeholder for Task 8.
struct ThreePaneView: View {
    var body: some View {
        Text("ThreePaneView – filled in Task 8")
    }
}
```

- [ ] **Step 4: Update `MarginApp.swift`**

Replace `/Users/jianjustin/workspaces/margin/Sources/Margin/MarginApp.swift` with:
```swift
import SwiftUI

@main
struct MarginApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup("Margin") {
            RootView()
                .environmentObject(state)
                .task { state.loadStoredVault() }
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Choose Vault…") { state.chooseVault() }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save") { state.saveCurrent() }
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(state.selectedNoteURL == nil)
            }
        }
    }
}
```

- [ ] **Step 5: Build**

Run:
```bash
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 6: Commit**

```bash
git add Sources/Margin
git commit -m "feat: add AppState, RootView, and welcome screen"
```

---

## Task 8: Three-pane shell + file tree view

**Files:**
- Modify: `Sources/Margin/UI/RootView.swift` (replace placeholder `ThreePaneView`)
- Create: `Sources/Margin/UI/FileTreeView.swift`

- [ ] **Step 1: Replace ThreePaneView in RootView**

Edit `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/RootView.swift` — remove the placeholder `ThreePaneView` and replace with:

```swift
struct ThreePaneView: View {
    @EnvironmentObject var state: AppState
    @State private var sidebarWidth: CGFloat = 240
    @State private var noteListWidth: CGFloat = 260

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: sidebarWidth, max: 360)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: noteListWidth, max: 400)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}
```

- [ ] **Step 2: Create FileTreeView**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/FileTreeView.swift`:
```swift
import SwiftUI

struct FileTreeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        List(selection: bindingForSelection()) {
            // Root-level "All" entry: selecting it shows notes directly under vault root.
            if let root = state.vaultRoot {
                Label("All", systemImage: "tray.full")
                    .tag(root as URL?)
            }
            ForEach(state.tree, id: \.id) { node in
                nodeView(node, depth: 0)
            }
        }
        .listStyle(.sidebar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    state.rescan()
                } label: { Image(systemName: "arrow.clockwise") }
                .help("Rescan vault")
            }
        }
    }

    @ViewBuilder
    private func nodeView(_ node: VaultNode, depth: Int) -> some View {
        switch node {
        case .folder(let url, let children):
            DisclosureGroup {
                ForEach(children, id: \.id) { child in
                    nodeView(child, depth: depth + 1)
                }
            } label: {
                Label(url.lastPathComponent, systemImage: folderIcon(url))
                    .tag(url as URL?)
            }
        case .note(let url):
            Label(url.deletingPathExtension().lastPathComponent, systemImage: "doc.text")
                .tag(url as URL?)
        }
    }

    private func folderIcon(_ url: URL) -> String {
        url.lastPathComponent.hasPrefix(".") ? "folder.badge.gearshape" : "folder"
    }

    private func bindingForSelection() -> Binding<URL?> {
        Binding(
            get: { state.selectedFolder ?? state.selectedNoteURL },
            set: { newValue in
                guard let url = newValue else {
                    state.selectedFolder = nil
                    return
                }
                let fm = FileManager.default
                var isDir: ObjCBool = false
                if fm.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                    state.selectFolder(url)
                } else {
                    state.openNote(url)
                }
            }
        )
    }
}
```

- [ ] **Step 3: Build**

Run:
```bash
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add Sources/Margin/UI/RootView.swift Sources/Margin/UI/FileTreeView.swift
git commit -m "feat: three-pane shell with file tree showing hidden dirs"
```

---

## Task 9: Note list view (middle pane)

**Files:**
- Create: `Sources/Margin/UI/NoteListView.swift`

- [ ] **Step 1: Create NoteListView**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/NoteListView.swift`:
```swift
import SwiftUI

struct NoteListView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        let urls = state.notesInSelectedFolder()
        List(urls, id: \.self, selection: selectionBinding) { url in
            NoteRow(url: url)
                .tag(url)
        }
        .listStyle(.inset)
        .overlay {
            if urls.isEmpty {
                Text("No notes in this folder")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var selectionBinding: Binding<URL?> {
        Binding(
            get: { state.selectedNoteURL },
            set: { newValue in
                if let url = newValue { state.openNote(url) }
            }
        )
    }
}

private struct NoteRow: View {
    let url: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(url.deletingPathExtension().lastPathComponent)
                .font(.system(size: 14, weight: .medium))
                .lineLimit(1)
            Text(preview)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(mtimeString)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        let body = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        let stripped = body
            .split(separator: "\n")
            .drop(while: { $0.hasPrefix("---") || $0.hasPrefix("title:") || $0.hasPrefix("tags:") || $0.hasPrefix("created:") })
            .joined(separator: " ")
        return String(stripped.prefix(120))
    }

    private var mtimeString: String {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let date = (attrs?[.modificationDate] as? Date) ?? .distantPast
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }
}
```

- [ ] **Step 2: Build**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add Sources/Margin/UI/NoteListView.swift
git commit -m "feat: note list pane with title preview mtime"
```

---

## Task 10: Editor view (plain NSTextView wrapper)

**Files:**
- Create: `Sources/Margin/UI/EditorView.swift`

- [ ] **Step 1: Create EditorView**

Create `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/EditorView.swift`:
```swift
import SwiftUI
import AppKit

struct EditorView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Group {
            if state.selectedNoteURL == nil {
                NoNoteSelectedView()
            } else {
                VStack(spacing: 0) {
                    EditorToolbar()
                    PlainTextEditor(text: $state.noteBody, onChange: {
                        state.dirty = true
                    })
                    .background(Color(NSColor.textBackgroundColor))
                }
            }
        }
    }
}

private struct EditorToolbar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack {
            if let url = state.selectedNoteURL {
                Text(url.deletingPathExtension().lastPathComponent)
                    .font(.headline)
            }
            if state.dirty {
                Circle()
                    .fill(.orange)
                    .frame(width: 8, height: 8)
                    .help("Unsaved changes")
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(NSColor.windowBackgroundColor))
        .overlay(Divider(), alignment: .bottom)
    }
}

private struct PlainTextEditor: NSViewRepresentable {
    @Binding var text: String
    let onChange: () -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let tv = scroll.documentView as? NSTextView else { return scroll }
        tv.delegate = context.coordinator
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isRichText = false
        tv.font = NSFont.systemFont(ofSize: 14)
        tv.textContainerInset = NSSize(width: 24, height: 16)
        tv.allowsUndo = true
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        if tv.string != text {
            tv.string = text
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: PlainTextEditor
        init(_ parent: PlainTextEditor) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            parent.text = tv.string
            parent.onChange()
        }
    }
}
```

- [ ] **Step 2: Build**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add Sources/Margin/UI/EditorView.swift
git commit -m "feat: minimal NSTextView editor with toolbar dirty indicator"
```

---

## Task 11: Auto-save on focus loss

**Files:**
- Modify: `Sources/Margin/UI/EditorView.swift`
- Modify: `Sources/Margin/AppState.swift`

- [ ] **Step 1: Add debounced auto-save to AppState**

Add to `/Users/jianjustin/workspaces/margin/Sources/Margin/AppState.swift`, append inside the class:
```swift
    private var autoSaveTask: Task<Void, Never>?

    func bodyChanged() {
        dirty = true
        autoSaveTask?.cancel()
        autoSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.saveCurrent() }
        }
    }
```

Update the `openNote` method to also cancel pending saves and persist the last selected note path:
```swift
    func openNote(_ url: URL) {
        autoSaveTask?.cancel()
        if dirty, let current = selectedNoteURL {
            try? FileIO.write(noteBody, to: current)
            dirty = false
        }
        selectedNoteURL = url
        noteBody = (try? FileIO.read(url)) ?? ""
        dirty = false
        UserDefaults.standard.set(url.path, forKey: UserDefaultsKeys.lastSelectedNotePath)
    }
```

- [ ] **Step 2: Wire change handler in EditorView**

In `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/EditorView.swift`, change the `onChange` closure passed to `PlainTextEditor`:

Replace:
```swift
                    PlainTextEditor(text: $state.noteBody, onChange: {
                        state.dirty = true
                    })
```

With:
```swift
                    PlainTextEditor(text: $state.noteBody, onChange: {
                        state.bodyChanged()
                    })
```

- [ ] **Step 3: Build**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Run all unit tests**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "passed|failed" | tail -10
```

Expected: all previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/Margin/AppState.swift Sources/Margin/UI/EditorView.swift
git commit -m "feat: debounced auto-save on body change"
```

---

## Task 12: Persist window frame + column widths

**Files:**
- Modify: `Sources/Margin/MarginApp.swift`
- Modify: `Sources/Margin/UI/RootView.swift`

- [ ] **Step 1: Use `@SceneStorage` and `@AppStorage` for column widths**

Edit `/Users/jianjustin/workspaces/margin/Sources/Margin/UI/RootView.swift` — change `ThreePaneView` to:

```swift
struct ThreePaneView: View {
    @EnvironmentObject var state: AppState
    @AppStorage(UserDefaultsKeys.sidebarWidth) private var sidebarWidth: Double = 240
    @AppStorage(UserDefaultsKeys.noteListWidth) private var noteListWidth: Double = 260

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: sidebarWidth, max: 360)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: noteListWidth, max: 400)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}
```

- [ ] **Step 2: Persist window frame via autosave name**

Edit `/Users/jianjustin/workspaces/margin/Sources/Margin/MarginApp.swift` — change the `WindowGroup` scene to also configure a frame autosave name on the underlying NSWindow. Because SwiftUI doesn't expose this directly, use a transparent `NSViewRepresentable` injected once.

Add this view to `MarginApp.swift` (above the `@main` struct):
```swift
import SwiftUI
import AppKit

private struct WindowAccessor: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let v = NSView()
        DispatchQueue.main.async {
            if let win = v.window { onWindow(win) }
        }
        return v
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}
```

Then update the `body` of `MarginApp` (replacing the entire `body`) to:
```swift
    var body: some Scene {
        WindowGroup("Margin") {
            RootView()
                .environmentObject(state)
                .background(WindowAccessor { win in
                    win.setFrameAutosaveName("MarginMainWindow")
                })
                .task { state.loadStoredVault() }
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Choose Vault…") { state.chooseVault() }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save") { state.saveCurrent() }
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(state.selectedNoteURL == nil)
            }
        }
    }
```

- [ ] **Step 3: Build**

Run:
```bash
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add Sources/Margin
git commit -m "feat: persist window frame and split column widths"
```

---

## Task 13: Manual smoke verification + M1 closeout

**Files:**
- Create: `docs/M1-verification.md`

- [ ] **Step 1: Launch the app**

Run:
```bash
cd /Users/jianjustin/workspaces/margin
xcodebuild -scheme Margin -configuration Debug -derivedDataPath build/ -destination "platform=macOS" build
open build/Build/Products/Debug/Margin.app
```

- [ ] **Step 2: Run through the manual checklist**

Create `/Users/jianjustin/workspaces/margin/docs/M1-verification.md`:
```markdown
# M1 Manual Verification

Date: <today>
Tester: <name>
Vault used: `~/Library/CloudStorage/OneDrive-个人/笔记库`

Check off each item as it passes; record bugs inline.

- [ ] App launches showing "Welcome to Margin" with a Choose Vault button
- [ ] Choosing the vault loads the file tree in the left pane
- [ ] `.obsidian`, `.claude`, and `.trash` (if present) are visible in the file tree
- [ ] Clicking a folder shows its `.md` files in the middle pane (in mtime-desc order)
- [ ] Clicking a note loads its content into the right-side editor
- [ ] Editing the note shows the orange dirty dot
- [ ] After ~1s of no typing, the dirty dot disappears (auto-save fired)
- [ ] Reopening the same note shows the saved content
- [ ] Cmd-S saves immediately
- [ ] Cmd-Shift-O reopens the vault picker
- [ ] Quit + relaunch restores: window position, column widths, last vault (no re-pick), last note open
- [ ] Editing the same `.md` from outside (e.g. Obsidian) and switching back to Margin: not yet expected to auto-reload (deferred to M2 file watcher); document the gap

Bugs / notes:

-

```

- [ ] **Step 3: If any checkbox fails, file a TODO and either fix-now (small) or carry into M2 plan (larger)**

Decision rule: any P0 in spec §1.1 must be working before declaring M1 done. The "reopening last vault" item is the most likely flake (security-scoped bookmark stale). If it flakes, capture symptom and continue — bookmark hardening can land in M2.

- [ ] **Step 4: Commit verification doc**

```bash
git add docs/M1-verification.md
git commit -m "docs: M1 manual verification checklist with results"
```

- [ ] **Step 5: Tag M1**

```bash
git tag -a v0.1.0-m1 -m "M1: skeleton with three-pane shell, vault picker, plain editor"
git log --oneline | head -20
```

---

## Out of Scope (deferred to subsequent plans)

- M2: SQLite/GRDB index + FTS5 search + file system watcher → produces a new plan
- M3: Bear-style inline markdown rendering → produces a new plan
- M4: Wiki link autocomplete + backlinks → produces a new plan
- M5: Tag system → produces a new plan
- M6: Cmd-K command palette → produces a new plan
- M7: Typography polish, image support, dark-mode tuning → produces a new plan

Each milestone's plan is written **after** the previous one ships, so the next plan can react to what we learned (e.g., NSTextView quirks discovered in M1 may reshape M3's approach).

---

## Self-Review Notes

- **Spec coverage**: M1 covers spec §1.1 #1 (data compat — read/write .md), part of #3 (hidden files visible), partial #4 (macOS native shell). #2 (Bear editor) intentionally deferred to M3.
- **Placeholder scan**: No "TODO", no "implement later", every code step contains code.
- **Type consistency**: `VaultNode.url`, `Note.title`, `AppState.openNote`, `AppState.bodyChanged`, `VaultPicker.chooseVault`/`resolveStoredVault` are referenced consistently across tasks.
- **Risks**: NSTextView + SwiftUI bridging is fiddly; if `updateNSView` causes selection loss on every keystroke, may need to skip the `tv.string = text` update when called from the same delegate cycle. Captured for follow-up.
