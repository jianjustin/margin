import XCTest
@testable import Margin

@MainActor
final class AppStateFolderScopingTests: XCTestCase {
    var tempDir: URL!

    override func setUp() async throws {
        let raw = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-scoping-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: raw, withIntermediateDirectories: true)
        // Resolve via realpath so paths match what contentsOfDirectory(at:) returns.
        let canonical = raw.path.withCString { ptr -> String in
            var buf = [CChar](repeating: 0, count: Int(PATH_MAX))
            if let r = realpath(ptr, &buf) { return String(cString: r) }
            return raw.path
        }
        tempDir = URL(fileURLWithPath: canonical)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func write(_ relPath: String, _ content: String = "") throws {
        let url = tempDir.appendingPathComponent(relPath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    func testSelectingFooDoesNotReturnFoobarNotes() throws {
        try write("foo/a.md")
        try write("foobar/b.md")

        let state = AppState()
        // tempDir is already canonical (via realpath in setUp), matching contentsOfDirectory URLs.
        state.openVault(url: tempDir)
        let fooURL = tempDir.appendingPathComponent("foo")
        state.selectFolder(fooURL)
        let urls = state.notesInSelectedFolder()
        let names = urls.map { $0.lastPathComponent }.sorted()
        XCTAssertEqual(names, ["a.md"], "Folder 'foo' must not leak notes from 'foobar'")
    }
}
