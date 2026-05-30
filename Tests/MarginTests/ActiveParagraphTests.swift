import XCTest
@testable import Margin

final class ActiveParagraphTests: XCTestCase {
    func testFindsParagraphAroundCursor() {
        let text = """
        first paragraph
        still first

        second paragraph
        """
        let cursor = 5 // inside "first paragraph"
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "first paragraph\nstill first")
    }

    func testFindsSecondParagraph() {
        let text = "alpha\n\nbeta gamma"
        let cursor = 8 // inside "beta"
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "beta gamma")
    }

    func testCursorOnBlankLineReturnsEmptyRange() {
        let text = "x\n\ny"
        let cursor = 2 // on the blank line
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        XCTAssertEqual(r.length, 0)
    }

    func testCursorAtVeryStart() {
        let text = "hello\n\nworld"
        let r = ActiveParagraph.range(in: text, cursor: 0)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "hello")
    }

    func testCursorAtVeryEnd() {
        let text = "alpha\n\nbeta"
        let r = ActiveParagraph.range(in: text, cursor: text.utf16.count)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "beta")
    }
}
