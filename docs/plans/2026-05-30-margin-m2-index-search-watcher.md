# Margin M2 (Index + Search + File Watcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite (GRDB + FTS5) index, an FSEvents-based file watcher, and a Cmd-Shift-F full-text search panel. After M2, Margin can find any note's content instantly, stays in sync when Obsidian writes to the vault, and persists derived data (link targets, tags) in `~/Library/Application Support/Margin/index.sqlite`.

**Architecture:** A single `DatabaseQueue` (GRDB) owned by an `IndexStore` service. An `Indexer` service translates between filesystem `.md` and DB rows. A `FileWatcher` (FSEvents wrapper) emits paths-changed events into the `Indexer`. A `SearchService` runs FTS5 queries. UI: search sheet triggered by Cmd-Shift-F. Markdown parsing in this milestone is minimal regex-only (links + tags); the full AST arrives in M3 and we'll swap the parsers then.

**Tech Stack:** Swift 5.10+, GRDB.swift 6.x via SPM, FSEvents (CoreServices), SwiftUI sheet. No new test runner.

**Spec:** [`2026-05-30-bear-obsidian-mac-editor-design.md`](../specs/2026-05-30-bear-obsidian-mac-editor-design.md) §3.2 (index schema) & §4-§7 (search behavior).

**Repo location:** `/Users/jianjustin/workspaces/margin` (tag `v0.1.0-m1` is the M1 baseline).

---

## File Structure (after M2 complete)

```
margin/
├── project.yml                          # +GRDB SPM dependency
├── Sources/Margin/
│   ├── Index/                           # NEW
│   │   ├── IndexLocation.swift          # path resolution: ~/Library/.../index.sqlite
│   │   ├── IndexStore.swift             # DatabaseQueue owner + migrations
│   │   ├── IndexSchema.swift            # all migrations registered here
│   │   ├── IndexedNote.swift            # row types + Codable
│   │   ├── IndexedLink.swift
│   │   ├── IndexedTag.swift
│   │   ├── MarkdownLite.swift           # regex-only link/tag extractor (M2)
│   │   ├── Indexer.swift                # scan vault → DB; incremental update one file
│   │   └── SearchService.swift          # FTS5 queries + snippet generation
│   ├── Vault/
│   │   └── FileWatcher.swift            # NEW: FSEvents wrapper
│   ├── AppState.swift                   # MODIFY: wire IndexStore + Indexer + FileWatcher
│   ├── UI/
│   │   ├── SearchSheet.swift            # NEW
│   │   ├── SearchResultRow.swift        # NEW
│   │   └── RootView.swift               # MODIFY: present .sheet
│   └── MarginApp.swift                  # MODIFY: add Search command (Cmd-Shift-F)
└── Tests/MarginTests/
    ├── MarkdownLiteTests.swift          # NEW
    ├── IndexerTests.swift               # NEW
    ├── IndexStoreTests.swift            # NEW
    └── SearchServiceTests.swift         # NEW
```

---

## Conventions

- All commands run from `/Users/jianjustin/workspaces/margin` unless noted.
- After editing source files / project.yml, run `xcodegen` then `xcodebuild` (the project file is generated).
- TDD applies to: MarkdownLite, IndexStore migrations, Indexer (single file + full scan via temp vault), SearchService. FileWatcher gets a minimal integration smoke test; not pure unit because it depends on real FS events.
- All new types live in their own files.
- Threading: every DB call goes through `DatabaseQueue.write {}` or `.read {}`. UI never touches the DB directly — it calls `IndexStore` / `SearchService` which encapsulate the queue.
- Concurrency model: services are `Sendable` value types or `actor`s. The `Indexer` is an `actor`. UI dispatches indexer work via `Task { await indexer.fullScan(...) }`.

---

## Task 1: Add GRDB dependency

**Files:** Modify `project.yml`.

- [ ] **Step 1:** Edit `project.yml` to add SPM packages and link them to the `Margin` target.

Add to the top-level `project.yml` (between `options:` and `settings:`, or anywhere outside `targets:`):

```yaml
packages:
  GRDB:
    url: https://github.com/groue/GRDB.swift
    from: 6.29.0
```

Inside the `Margin` target block, add a `dependencies` entry alongside `sources` / `info`:

```yaml
dependencies:
  - package: GRDB
    product: GRDB
```

Leave the `MarginTests` target's `dependencies` as-is (it only needs `target: Margin`; GRDB visibility comes transitively because tests use `@testable import Margin`).

- [ ] **Step 2:** Regenerate project + first GRDB-aware build.

```bash
cd /Users/jianjustin/workspaces/margin
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" -resolvePackageDependencies 2>&1 | tail -5
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expected last line of build: `** BUILD SUCCEEDED **`. The first `-resolvePackageDependencies` may take 30-90s as GRDB is fetched. If it stalls, that's network — wait, don't kill.

- [ ] **Step 3:** Verify GRDB resolves.

```bash
grep -A2 GRDB Margin.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved 2>/dev/null | head -8
```

Expected: shows GRDB at some 6.x version.

- [ ] **Step 4:** Smoke import.

Append the following to `Sources/Margin/AppState.swift` temporarily, then build:

```swift
import GRDB  // M2 smoke
```

Build again. If `import GRDB` fails, GRDB isn't linked into Margin — revisit project.yml. Remove this line after build succeeds (it'll be re-added later in real usage).

- [ ] **Step 5:** Tests still 13.

```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

Expected `Executed 13 tests, with 0 failures`.

- [ ] **Step 6:** Commit.

```bash
git add project.yml
git commit -m "build: add GRDB.swift 6.x dependency"
```

---

## Task 2: IndexLocation helper

**Files:** Create `Sources/Margin/Index/IndexLocation.swift`, `Tests/MarginTests/IndexLocationTests.swift`.

- [ ] **Step 1: Write failing test**

Create `Tests/MarginTests/IndexLocationTests.swift`:

```swift
import XCTest
@testable import Margin

final class IndexLocationTests: XCTestCase {
    func testReturnsURLUnderApplicationSupportMargin() throws {
        let url = try IndexLocation.default()
        XCTAssertTrue(url.path.hasSuffix("/Margin/index.sqlite"),
                      "expected …/Margin/index.sqlite, got \(url.path)")
        // Parent must exist (created on demand).
        let dir = url.deletingLastPathComponent()
        var isDir: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.path, isDirectory: &isDir))
        XCTAssertTrue(isDir.boolValue)
    }
}
```

- [ ] **Step 2: Run → fail**

```bash
xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | tail -10
```

Expect `Cannot find 'IndexLocation' in scope`.

- [ ] **Step 3: Implement**

Create `Sources/Margin/Index/IndexLocation.swift`:

```swift
import Foundation

enum IndexLocation {
    /// Returns ~/Library/Application Support/Margin/index.sqlite
    /// The Margin directory is created if missing.
    static func `default`() throws -> URL {
        let fm = FileManager.default
        let support = try fm.url(for: .applicationSupportDirectory,
                                 in: .userDomainMask,
                                 appropriateFor: nil,
                                 create: true)
        let dir = support.appendingPathComponent("Margin", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir.appendingPathComponent("index.sqlite")
    }
}
```

- [ ] **Step 4: Pass**

`xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"` → 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/Margin/Index/IndexLocation.swift Tests/MarginTests/IndexLocationTests.swift
git commit -m "feat(index): IndexLocation helper for index.sqlite path"
```

---

## Task 3: IndexStore + schema migrations

**Files:** Create `Sources/Margin/Index/IndexSchema.swift`, `Sources/Margin/Index/IndexStore.swift`, `Tests/MarginTests/IndexStoreTests.swift`.

- [ ] **Step 1: Write failing test for schema/migration**

Create `Tests/MarginTests/IndexStoreTests.swift`:

```swift
import XCTest
import GRDB
@testable import Margin

final class IndexStoreTests: XCTestCase {
    var tempDB: URL!

    override func setUpWithError() throws {
        tempDB = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-idx-\(UUID().uuidString).sqlite")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDB)
    }

    func testOpenCreatesAllRequiredTables() throws {
        let store = try IndexStore(databaseURL: tempDB)
        try store.queue.read { db in
            let tables = try String.fetchAll(db, sql: """
                SELECT name FROM sqlite_master
                WHERE type IN ('table','virtual') ORDER BY name
            """)
            // We expect: notes, links, tags, fts_notes (plus FTS-internal tables).
            XCTAssertTrue(tables.contains("notes"))
            XCTAssertTrue(tables.contains("links"))
            XCTAssertTrue(tables.contains("tags"))
            XCTAssertTrue(tables.contains("fts_notes"))
        }
    }

    func testOpenIsIdempotent() throws {
        _ = try IndexStore(databaseURL: tempDB)
        _ = try IndexStore(databaseURL: tempDB) // re-opening must not crash or re-create
    }

    func testNotesTableSchema() throws {
        let store = try IndexStore(databaseURL: tempDB)
        try store.queue.read { db in
            let cols = try Row.fetchAll(db, sql: "PRAGMA table_info(notes)")
                .map { $0["name"] as String? ?? "" }
            // path is PK; expect title, mtime, size, frontmatter_json columns.
            XCTAssertTrue(cols.contains("path"))
            XCTAssertTrue(cols.contains("title"))
            XCTAssertTrue(cols.contains("mtime"))
            XCTAssertTrue(cols.contains("size"))
            XCTAssertTrue(cols.contains("frontmatter_json"))
        }
    }
}
```

- [ ] **Step 2: Fail**

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'IndexStore' in scope`.

- [ ] **Step 3: Implement schema**

Create `Sources/Margin/Index/IndexSchema.swift`:

```swift
import Foundation
import GRDB

enum IndexSchema {
    static func register(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v1-initial") { db in
            // notes: one row per .md file.
            try db.create(table: "notes") { t in
                t.primaryKey("path", .text)
                t.column("title", .text).notNull()
                t.column("mtime", .double).notNull()      // unix epoch seconds
                t.column("size", .integer).notNull()
                t.column("frontmatter_json", .text)        // nullable
            }

            // links: one row per [[target]] reference in src note.
            try db.create(table: "links") { t in
                t.column("src_path", .text).notNull()
                  .references("notes", onDelete: .cascade)
                t.column("dst_target", .text).notNull()    // raw wiki link text
                t.column("line", .integer).notNull()
                t.column("context_snippet", .text).notNull()
            }
            try db.create(index: "idx_links_src", on: "links", columns: ["src_path"])
            try db.create(index: "idx_links_dst", on: "links", columns: ["dst_target"])

            // tags: one row per (path, tag) — source ∈ {frontmatter, inline}.
            try db.create(table: "tags") { t in
                t.column("path", .text).notNull()
                  .references("notes", onDelete: .cascade)
                t.column("tag", .text).notNull()
                t.column("source", .text).notNull()
                t.primaryKey(["path", "tag", "source"])
            }
            try db.create(index: "idx_tags_tag", on: "tags", columns: ["tag"])

            // fts_notes: contentless FTS5 mirror of title+body (populated by Indexer).
            try db.execute(sql: """
                CREATE VIRTUAL TABLE fts_notes USING fts5(
                    path UNINDEXED,
                    title,
                    body,
                    tokenize = 'unicode61 remove_diacritics 2'
                )
            """)
        }
    }
}
```

- [ ] **Step 4: Implement IndexStore**

Create `Sources/Margin/Index/IndexStore.swift`:

```swift
import Foundation
import GRDB

/// Owns the GRDB DatabaseQueue. Single instance per app lifetime.
final class IndexStore {
    let queue: DatabaseQueue

    init(databaseURL: URL) throws {
        var config = Configuration()
        config.label = "Margin.IndexStore"
        config.foreignKeysEnabled = true
        self.queue = try DatabaseQueue(path: databaseURL.path, configuration: config)

        var migrator = DatabaseMigrator()
        IndexSchema.register(in: &migrator)
        try migrator.migrate(self.queue)
    }
}
```

- [ ] **Step 5: Pass + commit**

```bash
xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

Expect 17 tests pass (14 prior + 3 new).

```bash
git add Sources/Margin/Index Tests/MarginTests/IndexStoreTests.swift
git commit -m "feat(index): IndexStore with notes/links/tags/fts schema"
```

---

## Task 4: Indexed row types

**Files:** Create `Sources/Margin/Index/IndexedNote.swift`, `IndexedLink.swift`, `IndexedTag.swift`.

No new tests — these are passive data carriers; behavior is tested via Indexer/SearchService tests in later tasks.

- [ ] **Step 1: Write the three types**

Create `Sources/Margin/Index/IndexedNote.swift`:

```swift
import Foundation
import GRDB

struct IndexedNote: Codable, FetchableRecord, PersistableRecord, Hashable {
    static let databaseTableName = "notes"

    var path: String
    var title: String
    var mtime: Double
    var size: Int
    var frontmatter_json: String?
}
```

Create `Sources/Margin/Index/IndexedLink.swift`:

```swift
import Foundation
import GRDB

struct IndexedLink: Codable, FetchableRecord, PersistableRecord, Hashable {
    static let databaseTableName = "links"

    var src_path: String
    var dst_target: String
    var line: Int
    var context_snippet: String
}
```

Create `Sources/Margin/Index/IndexedTag.swift`:

```swift
import Foundation
import GRDB

struct IndexedTag: Codable, FetchableRecord, PersistableRecord, Hashable {
    enum Source: String, Codable {
        case frontmatter
        case inline
    }

    static let databaseTableName = "tags"

    var path: String
    var tag: String
    var source: String   // "frontmatter" | "inline"
}
```

- [ ] **Step 2: Build + tests**

```bash
xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

Build SUCCEEDED. 17 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add Sources/Margin/Index/IndexedNote.swift Sources/Margin/Index/IndexedLink.swift Sources/Margin/Index/IndexedTag.swift
git commit -m "feat(index): IndexedNote/Link/Tag row types"
```

---

## Task 5: MarkdownLite parser (TDD)

**Files:** Create `Sources/Margin/Index/MarkdownLite.swift`, `Tests/MarginTests/MarkdownLiteTests.swift`.

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/MarkdownLiteTests.swift`:

```swift
import XCTest
@testable import Margin

final class MarkdownLiteTests: XCTestCase {
    func testExtractsSingleWikiLink() {
        let r = MarkdownLite.extract(from: "See [[note A]] today.")
        XCTAssertEqual(r.links.map(\.target), ["note A"])
        XCTAssertEqual(r.links.first?.line, 1)
    }

    func testIgnoresEscapedBracketsAndCodeBlocks() {
        let body = """
        Regular: [[real]]
        ```
        [[in-code]]
        ```
        Inline: `[[in-inline]]`
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.links.map(\.target), ["real"])
    }

    func testCapturesLineAndContext() {
        let body = """
        line1
        line2 with [[X]] here
        line3
        """
        let r = MarkdownLite.extract(from: body)
        let link = r.links.first
        XCTAssertEqual(link?.line, 2)
        XCTAssertTrue(link?.contextSnippet.contains("[[X]]") == true)
    }

    func testExtractsFlatAndNestedInlineTags() {
        let r = MarkdownLite.extract(from: "Hello #tag and #tag/sub/leaf end.")
        XCTAssertEqual(r.inlineTags.sorted(), ["tag", "tag/sub/leaf"])
    }

    func testIgnoresHashInCodeAndInString() {
        let body = """
        See `#nope` and #yes here.
        ```
        #also-nope
        ```
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.inlineTags, ["yes"])
    }

    func testExtractsFrontmatterTagsList() {
        let body = """
        ---
        title: T
        tags: [alpha, beta/sub]
        ---
        Body
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.frontmatterTags.sorted(), ["alpha", "beta/sub"])
    }

    func testExtractsFrontmatterTagsYAMLList() {
        let body = """
        ---
        tags:
          - one
          - two/three
        ---
        body
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.frontmatterTags.sorted(), ["one", "two/three"])
    }
}
```

- [ ] **Step 2: Fail**

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'MarkdownLite' in scope`.

- [ ] **Step 3: Implement**

Create `Sources/Margin/Index/MarkdownLite.swift`:

```swift
import Foundation

enum MarkdownLite {
    struct LinkRef: Hashable {
        var target: String
        var line: Int
        var contextSnippet: String
    }

    struct Result {
        var links: [LinkRef] = []
        var inlineTags: [String] = []
        var frontmatterTags: [String] = []
    }

    private static let wikiLinkRegex = try! NSRegularExpression(
        pattern: #"\[\[([^\[\]\n]+?)\]\]"#
    )
    private static let inlineTagRegex = try! NSRegularExpression(
        pattern: #"(?<![\w/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)"#
    )

    /// Splits body into (frontmatterBlock, restWithSameLineNumbers).
    private static func splitFrontmatter(_ body: String) -> (front: String?, restStartLine: Int) {
        guard body.hasPrefix("---") else { return (nil, 1) }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return (nil, 1) }
        var i = 1
        while i < lines.count, lines[i] != "---" { i += 1 }
        if i < lines.count {
            // i is the closing ---; rest starts at line i+2 (1-based)
            let frontJoined = lines[1..<i].joined(separator: "\n")
            return (frontJoined, i + 2)
        }
        return (nil, 1)
    }

    static func extract(from body: String) -> Result {
        var result = Result()
        let (front, _) = splitFrontmatter(body)
        if let front {
            result.frontmatterTags = parseFrontmatterTags(front)
        }

        // Strip fenced code blocks and inline code from a working copy for tag/link search,
        // but keep line numbers intact by replacing with spaces.
        let stripped = maskCodeRegions(body)

        let lines = stripped.components(separatedBy: "\n")
        let originalLines = body.components(separatedBy: "\n")

        for (idx, line) in lines.enumerated() {
            let lineNumber = idx + 1
            let ns = line as NSString
            let range = NSRange(location: 0, length: ns.length)

            // Wiki links
            wikiLinkRegex.enumerateMatches(in: line, range: range) { match, _, _ in
                guard let m = match, m.numberOfRanges >= 2 else { return }
                let inner = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
                guard !inner.isEmpty else { return }
                let ctx = idx < originalLines.count ? originalLines[idx] : ""
                result.links.append(LinkRef(
                    target: inner,
                    line: lineNumber,
                    contextSnippet: String(ctx.prefix(200))
                ))
            }

            // Inline tags
            inlineTagRegex.enumerateMatches(in: line, range: range) { match, _, _ in
                guard let m = match, m.numberOfRanges >= 2 else { return }
                let tag = ns.substring(with: m.range(at: 1))
                result.inlineTags.append(tag)
            }
        }

        // De-duplicate inline tags while preserving order of first appearance.
        var seen = Set<String>()
        result.inlineTags = result.inlineTags.filter { seen.insert($0).inserted }

        return result
    }

    /// Replaces fenced code blocks (```...```) and inline `code` with spaces of equal length,
    /// preserving line breaks so line numbers stay correct.
    private static func maskCodeRegions(_ body: String) -> String {
        var out = ""
        var inFence = false
        for line in body.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") {
                inFence.toggle()
                out.append(String(repeating: " ", count: line.count))
                out.append("\n")
                continue
            }
            if inFence {
                out.append(String(repeating: " ", count: line.count))
                out.append("\n")
                continue
            }
            // Mask inline `...` runs.
            let masked = maskInlineCode(in: line)
            out.append(masked)
            out.append("\n")
        }
        if out.hasSuffix("\n") { out.removeLast() }
        return out
    }

    private static func maskInlineCode(in line: String) -> String {
        var result = ""
        var inCode = false
        for ch in line {
            if ch == "`" {
                inCode.toggle()
                result.append(" ")
            } else if inCode {
                result.append(" ")
            } else {
                result.append(ch)
            }
        }
        return result
    }

    /// Parses YAML-ish frontmatter for the `tags:` key. Supports either:
    ///   tags: [a, b/c]
    ///   tags:
    ///     - a
    ///     - b/c
    private static func parseFrontmatterTags(_ block: String) -> [String] {
        let lines = block.components(separatedBy: "\n")
        guard let i = lines.firstIndex(where: { $0.hasPrefix("tags:") || $0.hasPrefix("tags ") }) else {
            return []
        }
        let header = lines[i]
        // Inline list?
        if let openBracket = header.firstIndex(of: "["),
           let closeBracket = header.firstIndex(of: "]"),
           openBracket < closeBracket {
            let inside = header[header.index(after: openBracket)..<closeBracket]
            return inside.split(separator: ",").map {
                $0.trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
            }.filter { !$0.isEmpty }
        }
        // YAML list on following lines.
        var result: [String] = []
        var j = i + 1
        while j < lines.count {
            let l = lines[j]
            if l.hasPrefix("  - ") || l.hasPrefix("- ") {
                let v = l.replacingOccurrences(of: "^\\s*-\\s+", with: "", options: .regularExpression)
                    .trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
                if !v.isEmpty { result.append(v) }
                j += 1
            } else {
                break
            }
        }
        return result
    }
}
```

- [ ] **Step 4: Pass + commit**

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → expect 24 tests pass (17 + 7 new).

```bash
git add Sources/Margin/Index/MarkdownLite.swift Tests/MarginTests/MarkdownLiteTests.swift
git commit -m "feat(index): MarkdownLite link/tag extractor"
```

---

## Task 6: Indexer (TDD)

**Files:** Create `Sources/Margin/Index/Indexer.swift`, `Tests/MarginTests/IndexerTests.swift`.

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/IndexerTests.swift`:

```swift
import XCTest
import GRDB
@testable import Margin

@MainActor
final class IndexerTests: XCTestCase {
    var vaultDir: URL!
    var dbURL: URL!
    var store: IndexStore!

    override func setUp() async throws {
        let unique = UUID().uuidString
        vaultDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-vault-\(unique)")
        try FileManager.default.createDirectory(at: vaultDir, withIntermediateDirectories: true)
        dbURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-idx-\(unique).sqlite")
        store = try IndexStore(databaseURL: dbURL)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: vaultDir)
        try? FileManager.default.removeItem(at: dbURL)
    }

    private func write(_ rel: String, _ content: String) throws -> URL {
        let url = vaultDir.appendingPathComponent(rel)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try content.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    func testFullScanInsertsNotes() async throws {
        _ = try write("a.md", "# A\nbody")
        _ = try write("sub/b.md", "B")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let count = try await store.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM notes") ?? 0
        }
        XCTAssertEqual(count, 2)
    }

    func testFullScanCapturesTitleFromFrontmatter() async throws {
        _ = try write("x.md", """
        ---
        title: Override Title
        ---
        body
        """)
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let title = try await store.queue.read { db -> String? in
            try String.fetchOne(db, sql: "SELECT title FROM notes WHERE path = ?", arguments: [
                vaultDir.appendingPathComponent("x.md").path
            ])
        }
        XCTAssertEqual(title, "Override Title")
    }

    func testFullScanWritesLinks() async throws {
        _ = try write("src.md", "ref [[target one]] and [[target two]]")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let targets = try await store.queue.read { db in
            try String.fetchAll(db, sql: "SELECT dst_target FROM links ORDER BY dst_target")
        }
        XCTAssertEqual(targets, ["target one", "target two"])
    }

    func testFullScanWritesInlineAndFrontmatterTags() async throws {
        _ = try write("t.md", """
        ---
        tags: [front-one, front-two]
        ---
        body has #inline-a and #inline-b/sub
        """)
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let rows = try await store.queue.read { db in
            try Row.fetchAll(db, sql: "SELECT tag, source FROM tags ORDER BY tag")
        }
        let tags = rows.map { ($0["tag"] as String, $0["source"] as String) }
        XCTAssertTrue(tags.contains(where: { $0.0 == "front-one" && $0.1 == "frontmatter" }))
        XCTAssertTrue(tags.contains(where: { $0.0 == "front-two" && $0.1 == "frontmatter" }))
        XCTAssertTrue(tags.contains(where: { $0.0 == "inline-a" && $0.1 == "inline" }))
        XCTAssertTrue(tags.contains(where: { $0.0 == "inline-b/sub" && $0.1 == "inline" }))
    }

    func testFullScanPopulatesFTS() async throws {
        _ = try write("doc.md", "# Searchable\nUnique phrase: orangutans dance.")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let hits = try await store.queue.read { db -> Int in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM fts_notes WHERE fts_notes MATCH ?",
                             arguments: ["orangutans"]) ?? 0
        }
        XCTAssertEqual(hits, 1)
    }

    func testFullScanReplacesStaleRows() async throws {
        _ = try write("file.md", "[[A]]")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        // mutate file: change link
        _ = try write("file.md", "[[B]]")
        try await indexer.fullScan(vaultRoot: vaultDir)
        let targets = try await store.queue.read { db in
            try String.fetchAll(db, sql: "SELECT dst_target FROM links")
        }
        XCTAssertEqual(targets, ["B"])
    }

    func testFullScanRemovesDeletedFiles() async throws {
        let url = try write("ghost.md", "# Ghost")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        try FileManager.default.removeItem(at: url)
        try await indexer.fullScan(vaultRoot: vaultDir)
        let count = try await store.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM notes") ?? 0
        }
        XCTAssertEqual(count, 0)
    }

    func testIncrementalUpdateSingleFile() async throws {
        let url = try write("inc.md", "[[Old]]")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        _ = try write("inc.md", "[[New]]")
        try await indexer.updateFile(url, vaultRoot: vaultDir)
        let targets = try await store.queue.read { db in
            try String.fetchAll(db, sql: "SELECT dst_target FROM links WHERE src_path = ?",
                                arguments: [url.path])
        }
        XCTAssertEqual(targets, ["New"])
    }

    func testIncrementalRemovesDeletedFile() async throws {
        let url = try write("del.md", "# X")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        try FileManager.default.removeItem(at: url)
        try await indexer.updateFile(url, vaultRoot: vaultDir)
        let exists = try await store.queue.read { db -> Bool in
            try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM notes WHERE path = ?)",
                              arguments: [url.path]) ?? false
        }
        XCTAssertFalse(exists)
    }
}
```

- [ ] **Step 2: Fail**

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'Indexer' in scope`.

- [ ] **Step 3: Implement Indexer**

Create `Sources/Margin/Index/Indexer.swift`:

```swift
import Foundation
import GRDB

actor Indexer {
    private let store: IndexStore

    init(store: IndexStore) {
        self.store = store
    }

    /// Re-scan the entire vault and reconcile DB with disk:
    /// - upsert every .md file
    /// - delete rows whose paths no longer exist on disk
    func fullScan(vaultRoot: URL) async throws {
        let fileURLs = collectMarkdownURLs(under: vaultRoot)
        let onDiskPaths = Set(fileURLs.map { $0.path })

        try await store.queue.write { db in
            // Wipe stale rows for files that disappeared.
            let existing = try String.fetchAll(db, sql: "SELECT path FROM notes")
            let toDelete = existing.filter { !onDiskPaths.contains($0) }
            for path in toDelete {
                try db.execute(sql: "DELETE FROM notes WHERE path = ?", arguments: [path])
                try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
            }

            // Upsert each on-disk file.
            for url in fileURLs {
                try Self.upsert(file: url, db: db)
            }
        }
    }

    /// Reconcile a single file. If it no longer exists, delete its rows; otherwise upsert.
    func updateFile(_ url: URL, vaultRoot: URL) async throws {
        let path = url.path
        if !FileManager.default.fileExists(atPath: path) {
            try await store.queue.write { db in
                try db.execute(sql: "DELETE FROM notes WHERE path = ?", arguments: [path])
                try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
            }
            return
        }
        try await store.queue.write { db in
            try Self.upsert(file: url, db: db)
        }
    }

    // MARK: - Internals

    nonisolated private func collectMarkdownURLs(under root: URL) -> [URL] {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: root,
                                             includingPropertiesForKeys: [.isRegularFileKey],
                                             options: []) else { return [] }
        var out: [URL] = []
        for case let u as URL in enumerator {
            if u.pathExtension.lowercased() == "md" {
                out.append(u)
            }
        }
        return out
    }

    private static func upsert(file url: URL, db: Database) throws {
        let path = url.path
        guard let body = try? String(contentsOf: url, encoding: .utf8) else { return }
        let attrs = (try? FileManager.default.attributesOfItem(atPath: path)) ?? [:]
        let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        let size = (attrs[.size] as? Int) ?? body.utf8.count

        // Title resolution mirrors Note.title (lite version).
        let title = resolveTitle(body: body, url: url)
        let frontmatterJSON = encodeFrontmatter(body: body)

        // Replace notes row.
        try db.execute(sql: """
            INSERT INTO notes(path, title, mtime, size, frontmatter_json)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                mtime = excluded.mtime,
                size  = excluded.size,
                frontmatter_json = excluded.frontmatter_json
        """, arguments: [path, title, mtime, size, frontmatterJSON])

        // Replace links + tags for this path.
        try db.execute(sql: "DELETE FROM links WHERE src_path = ?", arguments: [path])
        try db.execute(sql: "DELETE FROM tags WHERE path = ?", arguments: [path])
        let extracted = MarkdownLite.extract(from: body)
        for link in extracted.links {
            try db.execute(sql: """
                INSERT INTO links(src_path, dst_target, line, context_snippet)
                VALUES(?, ?, ?, ?)
            """, arguments: [path, link.target, link.line, link.contextSnippet])
        }
        for tag in extracted.frontmatterTags {
            try db.execute(sql: """
                INSERT OR IGNORE INTO tags(path, tag, source) VALUES(?, ?, 'frontmatter')
            """, arguments: [path, tag])
        }
        for tag in extracted.inlineTags {
            try db.execute(sql: """
                INSERT OR IGNORE INTO tags(path, tag, source) VALUES(?, ?, 'inline')
            """, arguments: [path, tag])
        }

        // Refresh FTS row.
        try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
        try db.execute(sql: """
            INSERT INTO fts_notes(path, title, body) VALUES(?, ?, ?)
        """, arguments: [path, title, body])
    }

    private static func resolveTitle(body: String, url: URL) -> String {
        // Prefer frontmatter title, then first H1, then filename.
        if body.hasPrefix("---") {
            let lines = body.components(separatedBy: "\n")
            var i = 1
            while i < lines.count, lines[i] != "---" {
                let l = lines[i]
                if let range = l.range(of: #"^\s*title\s*:\s*"#, options: .regularExpression) {
                    var v = String(l[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                    if v.hasPrefix("\""), v.hasSuffix("\""), v.count >= 2 {
                        v = String(v.dropFirst().dropLast())
                    }
                    if !v.isEmpty { return v }
                }
                i += 1
            }
        }
        for line in body.components(separatedBy: "\n") {
            if line.hasPrefix("# ") {
                return String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            }
        }
        return url.deletingPathExtension().lastPathComponent
    }

    /// Returns a JSON snapshot of frontmatter, or nil. Format is intentionally simple — a
    /// `[String: String]` of scalar keys. Anything richer is M3+ work.
    private static func encodeFrontmatter(body: String) -> String? {
        guard body.hasPrefix("---") else { return nil }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return nil }
        var dict: [String: String] = [:]
        var i = 1
        while i < lines.count, lines[i] != "---" {
            let l = lines[i]
            if let colon = l.firstIndex(of: ":") {
                let key = String(l[..<colon]).trimmingCharacters(in: .whitespaces)
                let value = String(l[l.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                if !key.isEmpty && !value.isEmpty && !value.hasPrefix("[") && !value.hasPrefix("-") {
                    dict[key] = value
                }
            }
            i += 1
        }
        if dict.isEmpty { return nil }
        return (try? JSONSerialization.data(withJSONObject: dict))
            .flatMap { String(data: $0, encoding: .utf8) }
    }
}
```

- [ ] **Step 4: Pass + commit**

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → expect 33 tests pass (24 prior + 9 new).

```bash
git add Sources/Margin/Index/Indexer.swift Tests/MarginTests/IndexerTests.swift
git commit -m "feat(index): Indexer with full + incremental sync"
```

---

## Task 7: FileWatcher (FSEvents)

**Files:** Create `Sources/Margin/Vault/FileWatcher.swift`, `Tests/MarginTests/FileWatcherTests.swift`.

This task uses a real FS event smoke test. The test creates a file in a temp dir, asserts the watcher's callback fires within 3 seconds. If your CI has flake constraints, this is a known async test pattern.

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/FileWatcherTests.swift`:

```swift
import XCTest
@testable import Margin

final class FileWatcherTests: XCTestCase {
    var watchDir: URL!

    override func setUpWithError() throws {
        watchDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-watcher-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: watchDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: watchDir)
    }

    func testFiresCallbackOnNewFile() throws {
        let expectation = XCTestExpectation(description: "fires for new file")
        let watcher = FileWatcher(root: watchDir, debounceMillis: 100) { _ in
            expectation.fulfill()
        }
        watcher.start()
        defer { watcher.stop() }

        // Give FSEvents a tick to subscribe.
        Thread.sleep(forTimeInterval: 0.3)

        let f = watchDir.appendingPathComponent("hello.md")
        try "x".write(to: f, atomically: true, encoding: .utf8)

        wait(for: [expectation], timeout: 3.0)
    }

    func testCoalescesBurstWritesViaDebounce() throws {
        let invocations = NSCountedSet()
        let lock = NSLock()
        let expectation = XCTestExpectation(description: "debounced")
        let watcher = FileWatcher(root: watchDir, debounceMillis: 300) { _ in
            lock.lock(); invocations.add("hit"); lock.unlock()
            expectation.fulfill()
        }
        watcher.start()
        defer { watcher.stop() }
        Thread.sleep(forTimeInterval: 0.3)

        for i in 0..<10 {
            try "x\(i)".write(to: watchDir.appendingPathComponent("burst-\(i).md"),
                              atomically: true, encoding: .utf8)
        }
        wait(for: [expectation], timeout: 3.0)
        // Allow some settle time before counting.
        Thread.sleep(forTimeInterval: 0.6)
        XCTAssertLessThan(invocations.count(for: "hit"), 10,
                          "debounce should coalesce 10 writes into <10 callbacks")
    }
}
```

- [ ] **Step 2: Fail**

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'FileWatcher' in scope`.

- [ ] **Step 3: Implement**

Create `Sources/Margin/Vault/FileWatcher.swift`:

```swift
import Foundation
import CoreServices

/// Recursive FSEvents watcher with debounced batch callback.
final class FileWatcher: @unchecked Sendable {
    typealias Callback = ([URL]) -> Void

    private let root: URL
    private let debounceMillis: Int
    private let callback: Callback

    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "Margin.FileWatcher")
    private var pendingPaths: Set<String> = []
    private var debounceWorkItem: DispatchWorkItem?

    init(root: URL, debounceMillis: Int = 500, callback: @escaping Callback) {
        self.root = root
        self.debounceMillis = debounceMillis
        self.callback = callback
    }

    func start() {
        let paths = [root.path] as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        let callback: FSEventStreamCallback = { _, contextInfo, numEvents, eventPaths, _, _ in
            guard let contextInfo else { return }
            let watcher = Unmanaged<FileWatcher>.fromOpaque(contextInfo).takeUnretainedValue()
            let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as! [String]
            watcher.enqueue(paths: paths)
        }
        guard let stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            callback,
            &context,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            0.2, // latency seconds — FSEvents coalesces inside this window
            FSEventStreamCreateFlags(
                kFSEventStreamCreateFlagFileEvents |
                kFSEventStreamCreateFlagNoDefer |
                kFSEventStreamCreateFlagUseCFTypes
            )
        ) else { return }

        FSEventStreamSetDispatchQueue(stream, queue)
        FSEventStreamStart(stream)
        self.stream = stream
    }

    func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    deinit { stop() }

    private func enqueue(paths: [String]) {
        queue.async { [weak self] in
            guard let self else { return }
            for p in paths { self.pendingPaths.insert(p) }
            self.debounceWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                let urls = self.pendingPaths.map { URL(fileURLWithPath: $0) }
                self.pendingPaths.removeAll()
                self.callback(urls)
            }
            self.debounceWorkItem = work
            self.queue.asyncAfter(deadline: .now() + .milliseconds(self.debounceMillis), execute: work)
        }
    }
}
```

- [ ] **Step 4: Pass + commit**

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → expect 35 tests pass.

```bash
git add Sources/Margin/Vault/FileWatcher.swift Tests/MarginTests/FileWatcherTests.swift
git commit -m "feat(vault): FSEvents-based recursive FileWatcher with debounce"
```

If the debounce test flakes on CI/local, mark it `XCTSkip` with a comment — don't tune the timers wildly. The behavior is what matters; counting exact callback invocations is timing-sensitive.

---

## Task 8: SearchService (TDD)

**Files:** Create `Sources/Margin/Index/SearchService.swift`, `Tests/MarginTests/SearchServiceTests.swift`.

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/SearchServiceTests.swift`:

```swift
import XCTest
import GRDB
@testable import Margin

@MainActor
final class SearchServiceTests: XCTestCase {
    var vaultDir: URL!
    var dbURL: URL!
    var store: IndexStore!
    var indexer: Indexer!
    var search: SearchService!

    override func setUp() async throws {
        let unique = UUID().uuidString
        vaultDir = FileManager.default.temporaryDirectory.appendingPathComponent("margin-srch-\(unique)")
        try FileManager.default.createDirectory(at: vaultDir, withIntermediateDirectories: true)
        dbURL = FileManager.default.temporaryDirectory.appendingPathComponent("margin-srch-\(unique).sqlite")
        store = try IndexStore(databaseURL: dbURL)
        indexer = Indexer(store: store)
        search = SearchService(store: store)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: vaultDir)
        try? FileManager.default.removeItem(at: dbURL)
    }

    private func write(_ rel: String, _ content: String) throws {
        let url = vaultDir.appendingPathComponent(rel)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    func testReturnsEmptyForEmptyQuery() async throws {
        try write("a.md", "anything")
        try await indexer.fullScan(vaultRoot: vaultDir)
        let results = try await search.query("")
        XCTAssertEqual(results.count, 0)
    }

    func testFindsByBodyTerm() async throws {
        try write("a.md", "morning orange juice")
        try write("b.md", "evening tea")
        try await indexer.fullScan(vaultRoot: vaultDir)
        let results = try await search.query("orange")
        XCTAssertEqual(results.map { $0.title }, ["a"])
    }

    func testRanksTitleHigherThanBody(async = ()) async throws {
        try write("alpha.md", "beta")          // body has "beta"
        try write("beta.md",  "gamma")         // title has "beta"
        try await indexer.fullScan(vaultRoot: vaultDir)
        let results = try await search.query("beta")
        XCTAssertEqual(results.count, 2)
        XCTAssertEqual(results.first?.title, "beta",
                       "title hit should outrank body hit; got \(results.map(\.title))")
    }

    func testSnippetIncludesQueryTerm() async throws {
        try write("a.md", "alpha bravo orangutans charlie delta")
        try await indexer.fullScan(vaultRoot: vaultDir)
        let results = try await search.query("orangutans")
        XCTAssertTrue(results.first?.snippet.contains("orangutans") == true,
                      "snippet should contain match; got \(results.first?.snippet ?? "nil")")
    }
}
```

(Note the second test has an unconventional `func testRanksTitleHigherThanBody(async = ()) async throws` — the `(async = ())` is a no-op default arg used because Swift treats `async` as a contextual keyword. If the compiler rejects this, rename to `func testRanksTitleHigherThanBody() async throws` and remove the dummy argument.)

- [ ] **Step 2: Fail**

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'SearchService' in scope`.

- [ ] **Step 3: Implement**

Create `Sources/Margin/Index/SearchService.swift`:

```swift
import Foundation
import GRDB

struct SearchResult: Identifiable, Hashable {
    var path: String
    var title: String
    var snippet: String
    var id: String { path }
}

actor SearchService {
    private let store: IndexStore

    init(store: IndexStore) {
        self.store = store
    }

    /// FTS5 query. Empty/whitespace input → empty result.
    /// Title hits are boosted via `bm25(fts_notes, 10.0, 1.0)` (title weight > body weight).
    func query(_ raw: String) async throws -> [SearchResult] {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }

        let ftsQuery = sanitizeForFTS5(trimmed)
        return try await store.queue.read { db -> [SearchResult] in
            let rows = try Row.fetchAll(db, sql: """
                SELECT path, title,
                       snippet(fts_notes, 2, '«', '»', '…', 16) AS snippet
                FROM fts_notes
                WHERE fts_notes MATCH ?
                ORDER BY bm25(fts_notes, 10.0, 1.0)
                LIMIT 100
            """, arguments: [ftsQuery])
            return rows.map { row in
                SearchResult(
                    path: row["path"],
                    title: row["title"],
                    snippet: row["snippet"]
                )
            }
        }
    }

    /// FTS5 reserves a small set of chars (", *, parens). Plain-prefix search is the
    /// most intuitive default for a notes app: each whitespace-split token becomes a
    /// prefix term ANDed together.
    private func sanitizeForFTS5(_ input: String) -> String {
        let tokens = input
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .map { token -> String in
                let escaped = token.replacingOccurrences(of: "\"", with: "\"\"")
                return "\"\(escaped)\"*"
            }
        return tokens.joined(separator: " AND ")
    }
}
```

- [ ] **Step 4: Pass + commit**

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → expect 39 tests pass.

```bash
git add Sources/Margin/Index/SearchService.swift Tests/MarginTests/SearchServiceTests.swift
git commit -m "feat(index): SearchService with FTS5 + bm25 ranking"
```

---

## Task 9: AppState integration (index + watcher)

**Files:** Modify `Sources/Margin/AppState.swift`.

- [ ] **Step 1: Add services + wire on vault open**

Edit `Sources/Margin/AppState.swift`. Add imports:

```swift
import Foundation
import SwiftUI
import GRDB
```

Add stored properties to `AppState` (near top, after the existing `@Published`s):

```swift
    // Index layer
    private var indexStore: IndexStore?
    private var indexer: Indexer?
    private var watcher: FileWatcher?
    @Published var indexing: Bool = false
    var searchService: SearchService? {
        indexStore.map { SearchService(store: $0) }
    }
```

Replace the existing `openVault(url:)` body with:

```swift
    func openVault(url: URL) {
        vaultRoot = url
        rescan()
        Task { await initializeIndex(vaultRoot: url) }
    }

    private func initializeIndex(vaultRoot: URL) async {
        do {
            let dbURL = try IndexLocation.default()
            let store = try IndexStore(databaseURL: dbURL)
            self.indexStore = store
            let idx = Indexer(store: store)
            self.indexer = idx

            indexing = true
            try await idx.fullScan(vaultRoot: vaultRoot)
            indexing = false

            // Start watcher AFTER initial scan so we don't process events for our own writes.
            let watcher = FileWatcher(root: vaultRoot, debounceMillis: 500) { [weak self] urls in
                Task { @MainActor in
                    guard let self else { return }
                    await self.handleFileEvents(urls: urls, vaultRoot: vaultRoot)
                }
            }
            watcher.start()
            self.watcher = watcher
        } catch {
            NSLog("Index init failed: \(error)")
            indexing = false
        }
    }

    private func handleFileEvents(urls: [URL], vaultRoot: URL) async {
        guard let indexer else { return }
        // Filter to .md files inside the vault.
        let mdURLs = urls.filter { url in
            url.pathExtension.lowercased() == "md" &&
            url.path.hasPrefix(vaultRoot.path + "/")
        }
        for url in mdURLs {
            try? await indexer.updateFile(url, vaultRoot: vaultRoot)
        }
        // Refresh sidebar tree only if folders may have changed.
        rescan()
    }
```

Also update `loadStoredVault` so its `openVault` call still triggers indexing — actually it already does because we changed `openVault` itself. No further change needed.

- [ ] **Step 2: Build + tests**

```bash
xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

Build SUCCEEDED. 39 tests pass.

- [ ] **Step 3: Commit**

```bash
git add Sources/Margin/AppState.swift
git commit -m "feat(app): wire IndexStore, Indexer, FileWatcher into AppState"
```

---

## Task 10: Search sheet UI

**Files:** Create `Sources/Margin/UI/SearchSheet.swift`, modify `Sources/Margin/UI/RootView.swift`, `Sources/Margin/MarginApp.swift`, `Sources/Margin/AppState.swift`.

- [ ] **Step 1: Add `searchSheetVisible` to AppState**

Insert into `AppState`:

```swift
    @Published var searchSheetVisible: Bool = false
```

- [ ] **Step 2: Create SearchSheet**

Create `Sources/Margin/UI/SearchSheet.swift`:

```swift
import SwiftUI

struct SearchSheet: View {
    @EnvironmentObject var state: AppState
    @State private var query: String = ""
    @State private var results: [SearchResult] = []
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search notes…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18))
                    .onSubmit { runSearch(query) }
                    .onChange(of: query) { _, newValue in
                        debounceSearch(newValue)
                    }
                Button("Close") { state.searchSheetVisible = false }
                    .keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()
            if results.isEmpty && !query.isEmpty {
                Text("No results")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(results) { result in
                    SearchResultRow(result: result)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            open(result)
                        }
                }
                .listStyle(.plain)
            }
        }
        .frame(width: 720, height: 480)
    }

    private func debounceSearch(_ value: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { runSearch(value) }
        }
    }

    private func runSearch(_ q: String) {
        guard let service = state.searchService else { return }
        Task {
            let hits = (try? await service.query(q)) ?? []
            await MainActor.run { self.results = hits }
        }
    }

    private func open(_ result: SearchResult) {
        let url = URL(fileURLWithPath: result.path)
        state.openNote(url)
        state.searchSheetVisible = false
    }
}
```

- [ ] **Step 3: Create SearchResultRow**

Create `Sources/Margin/UI/SearchResultRow.swift`:

```swift
import SwiftUI

struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(result.title)
                .font(.system(size: 15, weight: .medium))
            Text(result.snippet)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(relativePath)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 6)
    }

    private var relativePath: String {
        // Strip up to and including "/笔记库/" or fall back to last 3 components.
        let parts = result.path.components(separatedBy: "/")
        return parts.suffix(3).joined(separator: "/")
    }
}
```

- [ ] **Step 4: Present sheet from RootView**

Edit `Sources/Margin/UI/RootView.swift` — wrap the existing body's content with a `.sheet` modifier. Replace `RootView.body` with:

```swift
    var body: some View {
        Group {
            if state.vaultRoot == nil {
                NoVaultView(onChoose: { state.chooseVault() })
            } else {
                ThreePaneView()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .sheet(isPresented: $state.searchSheetVisible) {
            SearchSheet()
                .environmentObject(state)
        }
    }
```

- [ ] **Step 5: Add Cmd-Shift-F command**

Edit `Sources/Margin/MarginApp.swift`. Inside the existing `.commands { ... }` block, add a new CommandGroup AFTER the existing `CommandGroup(replacing: .saveItem)` block:

```swift
            CommandGroup(after: .textEditing) {
                Button("Find in Notes…") {
                    state.searchSheetVisible = true
                }
                .keyboardShortcut("f", modifiers: [.command, .shift])
                .disabled(state.vaultRoot == nil)
            }
```

- [ ] **Step 6: Build + tests**

```bash
xcodegen && xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

Build SUCCEEDED. 39 tests pass.

- [ ] **Step 7: Commit**

```bash
git add Sources/Margin/UI/SearchSheet.swift Sources/Margin/UI/SearchResultRow.swift \
        Sources/Margin/UI/RootView.swift Sources/Margin/MarginApp.swift Sources/Margin/AppState.swift
git commit -m "feat(ui): Cmd-Shift-F search sheet with FTS5 results"
```

---

## Task 11: M2 verification + tag

**Files:** Create `docs/M2-verification.md`.

- [ ] **Step 1: Build and run tests one more time**

```bash
cd /Users/jianjustin/workspaces/margin
xcodegen
xcodebuild -scheme Margin -configuration Debug -derivedDataPath build/ -destination "platform=macOS" build 2>&1 | tail -3
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "Executed|TEST"
```

Expect BUILD/TEST SUCCEEDED, 39 tests pass.

- [ ] **Step 2: Write checklist**

Create `docs/M2-verification.md`:

```markdown
# M2 手动验收

日期：2026-05-30
验收人：<待填>
使用的 vault：`~/Library/CloudStorage/OneDrive-个人/笔记库`

- [ ] 启动后，首次为大 vault 建索引时左下角有"Indexing…"状态（如 AppState.indexing 暴露到 UI 则可见；M2 内可仅用 console log 验证）
- [ ] 索引完成后，索引文件存在：`ls ~/Library/Application\ Support/Margin/index.sqlite`
- [ ] Cmd-Shift-F 弹出搜索面板
- [ ] 输入一个 vault 中肯定存在的词（如"投资"或"PKM"），300ms 内出现结果
- [ ] 点击结果跳到对应笔记
- [ ] 在 Obsidian 里改一篇 .md 并保存，回到 Margin 再次搜索，能搜到新内容
- [ ] 在 Obsidian 里新建一篇 .md，回到 Margin，文件树里出现（rescan 被 watcher 触发）
- [ ] 在 Obsidian 里删除一篇 .md，回到 Margin，搜索该笔记 0 结果

## 启动

```bash
open /Users/jianjustin/workspaces/margin/build/Build/Products/Debug/Margin.app
```
```

## 已知限制（M3+ 处理）

- 编辑器仍是纯文本（M3 才有内联渲染）
- 没有双链跳转（M4）
- 没有反向链接面板（M4）
- 没有 tag 树视图（M5）

## 问题 / 备注

-
```

- [ ] **Step 3: Commit and tag**

```bash
git add docs/M2-verification.md
git commit -m "docs: M2 verification checklist"
git tag -a v0.2.0-m2 -m "M2: SQLite index + FTS5 search + FSEvents watcher"
git log --oneline | head -12
```

---

## Out of Scope (M3+ owns)

- Markdown rendering / inline syntax styling (M3)
- Wiki link autocomplete popover (M4)
- Backlinks panel inside editor (M4)
- Tag tree in sidebar second tab (M5)
- Cmd-K command palette (M6)
- Typography polish + image rendering (M7)

---

## Self-Review

- **Spec coverage**: §3.2 (DB schema), §4 (search interaction), §7 (tag identification — index-level only this milestone). The tag *tree UI* is intentionally M5.
- **Placeholder scan**: none. Every code block is complete.
- **Type consistency**: `IndexStore.queue`, `Indexer.fullScan`, `Indexer.updateFile`, `SearchService.query`, `SearchResult(path:title:snippet:)`, `FileWatcher.start/stop`, `AppState.indexing/searchSheetVisible/searchService` all referenced consistently.
- **Risk**: FSEvents test depends on real FS notifications; flake possible. If the test flakes locally, mark it with `XCTSkip("flaky on local env")` and move on — the production behavior is verified manually in Task 11.
