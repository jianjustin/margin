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
            XCTAssertTrue(tables.contains("notes"))
            XCTAssertTrue(tables.contains("links"))
            XCTAssertTrue(tables.contains("tags"))
            XCTAssertTrue(tables.contains("fts_notes"))
        }
    }

    func testOpenIsIdempotent() throws {
        _ = try IndexStore(databaseURL: tempDB)
        _ = try IndexStore(databaseURL: tempDB)
    }

    func testNotesTableSchema() throws {
        let store = try IndexStore(databaseURL: tempDB)
        try store.queue.read { db in
            let cols = try Row.fetchAll(db, sql: "PRAGMA table_info(notes)")
                .map { $0["name"] as String? ?? "" }
            XCTAssertTrue(cols.contains("path"))
            XCTAssertTrue(cols.contains("title"))
            XCTAssertTrue(cols.contains("mtime"))
            XCTAssertTrue(cols.contains("size"))
            XCTAssertTrue(cols.contains("frontmatter_json"))
        }
    }
}
