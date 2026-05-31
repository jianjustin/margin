import XCTest
@testable import Margin

final class BlockKindIndexTests: XCTestCase {

    func testParagraphIsParagraph() {
        let idx = BlockKindIndex(text: "hello world\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .paragraph)
    }

    func testHeadingIsHeading() {
        let idx = BlockKindIndex(text: "# Title\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .heading)
    }

    func testQuoteIsQuote() {
        let idx = BlockKindIndex(text: "> a quote\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .quote)
        XCTAssertEqual(idx.kind(atUTF16Offset: 5), .quote)
    }

    func testCodeFenceIsCode() {
        let text = "```\nlet x = 1\n```\n"
        let idx = BlockKindIndex(text: text)
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .code)
        // Inside the body of the fence
        let inside = (text as NSString).range(of: "let x").location
        XCTAssertEqual(idx.kind(atUTF16Offset: inside), .code)
    }

    func testRangesOfQuote() {
        let text = "p one\n\n> q one\n> q two\n\np two\n"
        let idx = BlockKindIndex(text: text)
        let qs = idx.ranges(of: .quote)
        XCTAssertEqual(qs.count, 1)
        let ns = text as NSString
        let quoteSubstring = ns.substring(with: qs[0])
        XCTAssertTrue(quoteSubstring.contains("q one"))
        XCTAssertTrue(quoteSubstring.contains("q two"))
    }

    func testRangesOfCode() {
        let text = "intro\n\n```\nfoo\n```\n\nouttro\n"
        let idx = BlockKindIndex(text: text)
        let cs = idx.ranges(of: .code)
        XCTAssertEqual(cs.count, 1)
    }

    func testOutOfBoundsIsParagraph() {
        let idx = BlockKindIndex(text: "x")
        XCTAssertEqual(idx.kind(atUTF16Offset: 999), .paragraph)
    }
}
