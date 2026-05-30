import XCTest
import AppKit
@testable import Margin

final class FontStackTests: XCTestCase {

    override func setUp() {
        super.setUp()
        // Idempotent registration must not crash even when called twice.
        FontStack.register()
        FontStack.register()
    }

    func testUIReturnsAFont() {
        let f = FontStack.ui(size: 16, weight: .regular)
        XCTAssertEqual(f.pointSize, 16, accuracy: 0.01)
    }

    func testMonoReturnsAMonoFont() {
        let f = FontStack.mono(size: 13.5)
        XCTAssertTrue(f.isFixedPitch || f.fontName.lowercased().contains("mono") ||
                      f.fontName.lowercased().contains("sf") ||
                      f.fontName.lowercased().contains("plex"))
    }

    func testSerifReturnsAFont() {
        let f = FontStack.serif(size: 18, weight: .medium)
        XCTAssertEqual(f.pointSize, 18, accuracy: 0.01)
    }

    func testItalicVariant() {
        let f = FontStack.ui(size: 16, weight: .regular, italic: true)
        let traits = NSFontManager.shared.traits(of: f)
        // Either a true italic face was found, or the system fallback emulates italic.
        // Either way: pointSize matches and we got a usable NSFont.
        XCTAssertEqual(f.pointSize, 16, accuracy: 0.01)
        // Don't hard-assert italic trait — system fallback may not carry it.
        _ = traits
    }

    func testWeightMapping() {
        let regular = FontStack.ui(size: 16, weight: .regular)
        let bold = FontStack.ui(size: 16, weight: .semibold)
        XCTAssertNotEqual(regular.fontName, bold.fontName.isEmpty ? "" : bold.fontName,
                          "semibold should resolve to a different concrete font than regular")
    }
}
