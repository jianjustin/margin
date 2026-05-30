import XCTest
import AppKit
@testable import Margin

final class PaletteTests: XCTestCase {
    func testOklchPureBlack() {
        let c = Palette.oklch(l: 0, c: 0, h: 0)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.usingColorSpace(.sRGB)!.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 0, accuracy: 0.01)
        XCTAssertEqual(g, 0, accuracy: 0.01)
        XCTAssertEqual(b, 0, accuracy: 0.01)
        XCTAssertEqual(a, 1, accuracy: 0.001)
    }

    func testOklchPureWhite() {
        let c = Palette.oklch(l: 1, c: 0, h: 0)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.usingColorSpace(.sRGB)!.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 1, accuracy: 0.01)
        XCTAssertEqual(g, 1, accuracy: 0.01)
        XCTAssertEqual(b, 1, accuracy: 0.01)
    }

    func testDarkPaletteBgIsDark() {
        let p = Palette.dark(accent: .warmGold)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        p.bg.usingColorSpace(.sRGB)!.getRed(&r, green: &g, blue: &b, alpha: &a)
        // oklch L=0.165 → roughly 4–6% sRGB brightness.
        XCTAssertLessThan((r + g + b) / 3, 0.10)
    }

    func testLightPaletteBgIsLight() {
        let p = Palette.light(accent: .warmGold)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        p.bg.usingColorSpace(.sRGB)!.getRed(&r, green: &g, blue: &b, alpha: &a)
        // oklch L=0.975 → very high sRGB brightness.
        XCTAssertGreaterThan((r + g + b) / 3, 0.92)
    }

    func testAccentSoftHasLowerAlpha() {
        let p = Palette.dark(accent: .warmGold)
        var aFull: CGFloat = 0, aSoft: CGFloat = 0
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0
        p.accent.getRed(&r1, green: &g1, blue: &b1, alpha: &aFull)
        p.accentSoft.getRed(&r2, green: &g2, blue: &b2, alpha: &aSoft)
        XCTAssertEqual(aFull, 1, accuracy: 0.001)
        XCTAssertEqual(aSoft, 0.14, accuracy: 0.001)
    }

    func testWarmGoldAccentIsGolden() {
        let p = Palette.dark(accent: .warmGold)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        p.accent.usingColorSpace(.sRGB)!.getRed(&r, green: &g, blue: &b, alpha: &a)
        // Warm gold ≈ high red, mid-high green, low blue.
        XCTAssertGreaterThan(r, 0.70)
        XCTAssertGreaterThan(g, 0.55)
        XCTAssertLessThan(b, 0.55)
    }
}
