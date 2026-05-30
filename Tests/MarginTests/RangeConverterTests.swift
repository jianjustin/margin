import XCTest
import Markdown
@testable import Margin

final class RangeConverterTests: XCTestCase {
    func testSingleLineASCII() {
        let text = "hello world"
        let range = makeRange(line1: 1, col1: 7, line2: 1, col2: 12)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns, NSRange(location: 6, length: 5))
    }

    func testMultilineASCII() {
        let text = "alpha\nbeta gamma\ndelta"
        let range = makeRange(line1: 2, col1: 1, line2: 2, col2: 6)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns, NSRange(location: 6, length: 5))
    }

    func testHandlesMultiByteUTF8() {
        let text = "你好 world"
        let range = makeRange(line1: 1, col1: 1, line2: 1, col2: 3)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns, NSRange(location: 0, length: 2))
    }

    func testEndOfFileSpan() {
        let text = "abc\n"
        let range = makeRange(line1: 2, col1: 1, line2: 2, col2: 1)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns?.location, 4)
        XCTAssertEqual(ns?.length, 0)
    }

    func testReturnsNilForOutOfBoundsLine() {
        let text = "one\ntwo"
        let range = makeRange(line1: 5, col1: 1, line2: 5, col2: 4)
        XCTAssertNil(RangeConverter.nsRange(of: range, in: text))
    }

    private func makeRange(line1: Int, col1: Int, line2: Int, col2: Int) -> SourceRange {
        SourceRange(
            start: SourceLocation(line: line1, column: col1, source: nil),
            end:   SourceLocation(line: line2, column: col2, source: nil)
        )
    }
}
