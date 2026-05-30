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
