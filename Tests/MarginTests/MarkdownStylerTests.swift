import XCTest
import AppKit
@testable import Margin

final class MarkdownStylerTests: XCTestCase {
    let typo = Typography.current()

    func testBodyTextUsesBodyFont() {
        let a = MarkdownStyler.style("hello world", activeRange: nil, typography: typo)
        let attrs = a.attributes(at: 0, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.body)
    }

    func testHeadingLineGetsH1Font() {
        let text = "# Big Title"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        let attrs = a.attributes(at: 2, effectiveRange: nil) // "B" in "Big"
        XCTAssertEqual(attrs[.font] as? NSFont, typo.h1)
    }

    func testHeadingMarkerHiddenWhenNotActive() {
        let text = "# Title"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        let markerAttrs = a.attributes(at: 0, effectiveRange: nil) // '#'
        XCTAssertEqual(markerAttrs[.foregroundColor] as? NSColor, typo.hiddenSyntax)
    }

    func testHeadingMarkerVisibleWhenActive() {
        let text = "# Title"
        let active = NSRange(location: 0, length: text.utf16.count)
        let a = MarkdownStyler.style(text, activeRange: active, typography: typo)
        let markerAttrs = a.attributes(at: 0, effectiveRange: nil)
        XCTAssertEqual(markerAttrs[.foregroundColor] as? NSColor, typo.primaryText)
    }

    func testBoldRunUsesBoldFont() {
        let text = "say **hi** there"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // "h" is at offset 6 (after "say **")
        let attrs = a.attributes(at: 6, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.bodyBold)
    }

    func testWikiLinkRunIsBlue() {
        let text = "see [[A]] here"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // "A" is at offset 6 (after "see [[")
        let attrs = a.attributes(at: 6, effectiveRange: nil)
        XCTAssertEqual(attrs[.foregroundColor] as? NSColor, typo.linkBlue)
    }

    func testInlineTagIsPurple() {
        let text = "use #tag here"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // "t" of "tag" is at offset 5 (after "use #")
        let attrs = a.attributes(at: 5, effectiveRange: nil)
        XCTAssertEqual(attrs[.foregroundColor] as? NSColor, typo.tagPurple)
    }

    func testInlineCodeUsesMonoAndBackground() {
        let text = "see `code` thx"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // "c" of "code" is at offset 5
        let attrs = a.attributes(at: 5, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.mono)
        XCTAssertNotNil(attrs[.backgroundColor])
    }

    func testParagraphStyleAppliesLineHeight() {
        let text = "hello"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        let attrs = a.attributes(at: 0, effectiveRange: nil)
        let pstyle = attrs[.paragraphStyle] as? NSParagraphStyle
        XCTAssertNotNil(pstyle, "paragraph style must be set")
        XCTAssertEqual(pstyle?.lineHeightMultiple ?? 0, typo.bodyLineHeightMultiplier, accuracy: 0.001)
    }

    func testBlockQuoteMarkerUsesQuoteBarColor() {
        let text = "> quoted line"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // First char is '>' — should be quoteBar color.
        let attrs = a.attributes(at: 0, effectiveRange: nil)
        XCTAssertEqual(attrs[.foregroundColor] as? NSColor, typo.quoteBar)
    }
}
