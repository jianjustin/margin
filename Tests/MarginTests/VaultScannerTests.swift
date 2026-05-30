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
