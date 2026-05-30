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
        // Use realpath-resolved path because FileManager.tmp returns symlinked /var path.
        let expectedPath = vaultDir.appendingPathComponent("x.md")
            .resolvingSymlinksInPath().path
        let title = try await store.queue.read { db -> String? in
            try String.fetchOne(db, sql: "SELECT title FROM notes WHERE path = ?",
                                arguments: [expectedPath])
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
        let expectedPath = url.resolvingSymlinksInPath().path
        let targets = try await store.queue.read { db in
            try String.fetchAll(db, sql: "SELECT dst_target FROM links WHERE src_path = ?",
                                arguments: [expectedPath])
        }
        XCTAssertEqual(targets, ["New"])
    }

    func testIncrementalRemovesDeletedFile() async throws {
        let url = try write("del.md", "# X")
        let indexer = Indexer(store: store)
        try await indexer.fullScan(vaultRoot: vaultDir)
        try FileManager.default.removeItem(at: url)
        try await indexer.updateFile(url, vaultRoot: vaultDir)
        let expectedPath = url.resolvingSymlinksInPath().path
        let exists = try await store.queue.read { db -> Bool in
            try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM notes WHERE path = ?)",
                              arguments: [expectedPath]) ?? false
        }
        XCTAssertFalse(exists)
    }
}
