import XCTest
@testable import Margin

@MainActor
final class ThemeStoreTests: XCTestCase {

    override func setUp() async throws {
        let d = UserDefaults.standard
        d.removeObject(forKey: UserDefaultsKeys.themeMode)
        d.removeObject(forKey: UserDefaultsKeys.themeAccent)
        d.removeObject(forKey: UserDefaultsKeys.editorFontKey)
        d.removeObject(forKey: UserDefaultsKeys.editorFontSize)
    }

    func testDefaultsAreDarkWarmGoldSans16() {
        let s = ThemeStore()
        XCTAssertEqual(s.mode, .dark)
        XCTAssertEqual(s.accent, .warmGold)
        XCTAssertEqual(s.fontKey, .sans)
        XCTAssertEqual(s.fontSize, 16, accuracy: 0.001)
    }

    func testTogglingPersists() {
        let s = ThemeStore()
        s.toggleMode()
        XCTAssertEqual(s.mode, .light)
        let s2 = ThemeStore()
        XCTAssertEqual(s2.mode, .light)
    }

    func testPaletteFollowsMode() {
        let s = ThemeStore()
        let darkBg = s.palette.bg
        s.toggleMode()
        let lightBg = s.palette.bg
        XCTAssertNotEqual(darkBg, lightBg)
    }

    func testSettingFontSizePersistsAndPublishes() {
        let s = ThemeStore()
        s.fontSize = 18
        let s2 = ThemeStore()
        XCTAssertEqual(s2.fontSize, 18, accuracy: 0.001)
    }
}
