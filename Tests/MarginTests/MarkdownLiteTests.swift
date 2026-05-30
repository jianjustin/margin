import XCTest
@testable import Margin

final class MarkdownLiteTests: XCTestCase {
    func testExtractsSingleWikiLink() {
        let r = MarkdownLite.extract(from: "See [[note A]] today.")
        XCTAssertEqual(r.links.map(\.target), ["note A"])
        XCTAssertEqual(r.links.first?.line, 1)
    }

    func testIgnoresEscapedBracketsAndCodeBlocks() {
        let body = """
        Regular: [[real]]
        ```
        [[in-code]]
        ```
        Inline: `[[in-inline]]`
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.links.map(\.target), ["real"])
    }

    func testCapturesLineAndContext() {
        let body = """
        line1
        line2 with [[X]] here
        line3
        """
        let r = MarkdownLite.extract(from: body)
        let link = r.links.first
        XCTAssertEqual(link?.line, 2)
        XCTAssertTrue(link?.contextSnippet.contains("[[X]]") == true)
    }

    func testExtractsFlatAndNestedInlineTags() {
        let r = MarkdownLite.extract(from: "Hello #tag and #tag/sub/leaf end.")
        XCTAssertEqual(r.inlineTags.sorted(), ["tag", "tag/sub/leaf"])
    }

    func testIgnoresHashInCodeAndInString() {
        let body = """
        See `#nope` and #yes here.
        ```
        #also-nope
        ```
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.inlineTags, ["yes"])
    }

    func testExtractsFrontmatterTagsList() {
        let body = """
        ---
        title: T
        tags: [alpha, beta/sub]
        ---
        Body
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.frontmatterTags.sorted(), ["alpha", "beta/sub"])
    }

    func testExtractsFrontmatterTagsYAMLList() {
        let body = """
        ---
        tags:
          - one
          - two/three
        ---
        body
        """
        let r = MarkdownLite.extract(from: body)
        XCTAssertEqual(r.frontmatterTags.sorted(), ["one", "two/three"])
    }
}
