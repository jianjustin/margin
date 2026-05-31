import XCTest
@testable import Margin

final class StatsCalculatorTests: XCTestCase {

    func testEmptyTextYieldsZeros() {
        let s = StatsCalculator.compute("")
        XCTAssertEqual(s.chars, 0)
        XCTAssertEqual(s.words, 0)
        XCTAssertEqual(s.minutes, 1)      // floor is 1 minute per the design
        XCTAssertEqual(s.blocks, 0)
    }

    func testCharsCountExcludesWhitespace() {
        let s = StatsCalculator.compute("hello  world\n\n")
        XCTAssertEqual(s.chars, 10)   // "helloworld"
    }

    func testEnglishWordCount() {
        let s = StatsCalculator.compute("the quick brown fox")
        XCTAssertEqual(s.words, 4)
    }

    func testEnglishContractionsAreOneWord() {
        let s = StatsCalculator.compute("it's a test it-self")
        // "it's", "a", "test", "it-self" → 4
        XCTAssertEqual(s.words, 4)
    }

    func testCJKCharactersCountAsWords() {
        let s = StatsCalculator.compute("你好世界")
        XCTAssertEqual(s.words, 4)
        XCTAssertEqual(s.chars, 4)
    }

    func testMixedCJKAndEnglish() {
        let s = StatsCalculator.compute("hello 你好 world 世界")
        // 2 english words + 4 CJK chars = 6
        XCTAssertEqual(s.words, 6)
    }

    func testReadingTimeIsAtLeastOneMinute() {
        let s = StatsCalculator.compute("hello world")
        XCTAssertEqual(s.minutes, 1)
    }

    func testReadingTimeScalesAt320WPM() {
        // 640 english words → 2 minutes
        let text = String(repeating: "word ", count: 640)
        let s = StatsCalculator.compute(text)
        XCTAssertEqual(s.minutes, 2)
    }

    func testBlocksCountSimpleMarkdown() {
        let md = """
        # Heading

        Paragraph one.

        - item

        ```
        code
        ```
        """
        let s = StatsCalculator.compute(md)
        // heading, paragraph, list, code = 4 top-level blocks
        XCTAssertEqual(s.blocks, 4)
    }

    func testBlankInputYieldsZeroBlocks() {
        let s = StatsCalculator.compute("\n\n   \n")
        XCTAssertEqual(s.blocks, 0)
    }
}
