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

    func testRanksTitleHigherThanBody() async throws {
        try write("alpha.md", "beta")          // body has "beta"
        try write("beta.md",  "gamma")         // title (filename) has "beta"
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
