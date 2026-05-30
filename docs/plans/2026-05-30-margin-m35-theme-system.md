# Margin M3.5 (Theme System: Dark + Warm Gold + IBM Plex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc system colors / fonts in `Typography.swift` with a centralized theme layer that matches the redesign mockup: oklch-derived warm-gold-on-dark palette, IBM Plex font family, persisted user choice between dark and light. All existing M3 inline rendering must continue to work; the editor visually adopts the mockup's color/typography language end-to-end.

**Architecture:**
- New `Theme/` module owns three pieces: `Palette` (color tokens from oklch math), `FontStack` (IBM Plex registration + lookup with graceful fallback to system fonts), `ThemeStore` (observable user-facing state, persisted to UserDefaults).
- `Typography` becomes a thin adapter built from `(Palette, FontStack)`. Its public surface (used by `MarkdownStyler`) stays unchanged — only its construction moves.
- `RootView` injects a single `ThemeStore` into the SwiftUI environment; the `NSTextView` `Coordinator` rebuilds `Typography` and re-styles whenever the store publishes.
- Visible delta: theme toggle button next to the dirty dot in `EditorToolbar` (temporary host until M3.6's TitleBar); editor pane background, body color, link/tag color, code background, quote bar — all sourced from `Palette`.

**Tech Stack:** Swift 5.10+, AppKit `NSColor`/`NSFont`/`CTFontManagerRegisterFontsForURL`, SwiftUI `ObservableObject`/`@EnvironmentObject` (matching `AppState`), no new SPM dependencies.

**Spec:** [`2026-05-30-margin-editor-redesign.md`](../specs/2026-05-30-margin-editor-redesign.md) §3 (Theme), §9 (interim toggle location).

**Repo location:** `/Users/jianjustin/workspaces/margin`.

**Scope notes:**
- Only `warm gold` accent ships now; the other four (terracotta/indigo/moss/violet) are stubbed in the palette table behind a `themeAccent` key but the toggle UI exposes only dark/light.
- IBM Plex `.ttf` files are not added to the repo by this plan. The plan creates the bundled `Fonts/` slot and wires registration; the developer drops the files in following the instructions in Task 2 (or the runtime fallback to system fonts simply applies).
- This plan only modifies inside the editor pane. The TitleBar / StatusBar / FileTree row rewrites are M3.6 / M3.7.

---

## File Structure (after M3.5 complete)

```
margin/
├── project.yml                                  # MODIFY: declare Resources/ + Fonts/ as bundled
├── Sources/Margin/
│   ├── Resources/
│   │   └── Fonts/                               # NEW (folder + .gitkeep + README.md)
│   ├── Theme/                                   # NEW (M3.5 owns the directory)
│   │   ├── Palette.swift                        # oklch→sRGB math + dark/light tables + accents
│   │   ├── FontStack.swift                      # CTFontManager registration + ui/mono/serif lookup
│   │   └── ThemeStore.swift                     # ObservableObject + UserDefaults persistence
│   ├── Persistence/
│   │   └── UserDefaultsKeys.swift               # MODIFY: add themeMode/accentIndex/fontKey/size
│   ├── Editor/
│   │   └── Typography.swift                     # MODIFY: build from (Palette, FontStack)
│   ├── MarginApp.swift                          # MODIFY: register fonts at launch, own ThemeStore
│   └── UI/
│       ├── RootView.swift                       # MODIFY: inject ThemeStore via .environmentObject
│       └── EditorView.swift                     # MODIFY: theme toggle in toolbar, re-render on change
└── Tests/MarginTests/
    ├── PaletteTests.swift                       # NEW
    ├── FontStackTests.swift                     # NEW
    └── ThemeStoreTests.swift                    # NEW
```

---

## Conventions

- Run all commands from `/Users/jianjustin/workspaces/margin`. Run `xcodegen` after touching `project.yml` or adding new Swift files anywhere under `Sources/` or `Tests/`.
- Tests use XCTest. Run with `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/<ClassName>`.
- Commit after each task completes (final step in every task is a commit).
- Do not bundle binary font files via this plan. Task 2's commit includes only the empty `Fonts/` directory plus a README pointing at IBM Plex's GitHub release. The developer may add `.ttf` files in a separate later commit.

---

## Task 1: Project structure + new UserDefaults keys

**Files:**
- Create: `Sources/Margin/Resources/Fonts/.gitkeep`
- Create: `Sources/Margin/Resources/Fonts/README.md`
- Modify: `project.yml`
- Modify: `Sources/Margin/Persistence/UserDefaultsKeys.swift`

- [ ] **Step 1:** Create the directory and placeholders.

```bash
mkdir -p Sources/Margin/Resources/Fonts
touch Sources/Margin/Resources/Fonts/.gitkeep
```

Write `Sources/Margin/Resources/Fonts/README.md`:

```markdown
# Bundled fonts

Drop IBM Plex `.ttf` files here. They are auto-registered at app launch by
`FontStack.register()` and resolved by `FontStack.ui(...)` / `mono(...)` / `serif(...)`.

If a file is missing, that lookup falls back to the system font — the app still launches.

## Recommended subset (M3.5)

Download the latest IBM Plex release from
https://github.com/IBM/plex/releases/latest and copy these files into this folder:

- `IBMPlexSans-Regular.ttf`
- `IBMPlexSans-Medium.ttf`
- `IBMPlexSans-SemiBold.ttf`
- `IBMPlexSans-Italic.ttf`
- `IBMPlexSansSC-Regular.ttf`
- `IBMPlexSansSC-Medium.ttf`
- `IBMPlexSansSC-SemiBold.ttf`
- `IBMPlexMono-Regular.ttf`
- `IBMPlexMono-Medium.ttf`
- `IBMPlexSerif-Regular.ttf`
- `IBMPlexSerif-Medium.ttf`

License: SIL Open Font License 1.1 (see IBM Plex repository).
```

- [ ] **Step 2:** Edit `project.yml`. Inside `targets.Margin`, add a `resources:` entry next to `sources:`. After the change the `Margin` target block reads:

```yaml
  Margin:
    type: application
    platform: macOS
    sources:
      - path: Sources/Margin
        excludes:
          - "Resources/**"
    resources:
      - path: Sources/Margin/Resources
    info:
      path: Sources/Margin/Info.plist
      properties:
        CFBundleDisplayName: Margin
        CFBundleShortVersionString: "0.1.0"
        CFBundleVersion: "1"
        LSMinimumSystemVersion: "14.0"
        NSHumanReadableCopyright: "Personal use"
        NSPrincipalClass: NSApplication
    dependencies:
      - package: GRDB
        product: GRDB
      - package: Markdown
        product: Markdown
    scheme:
      testTargets:
        - MarginTests
```

The `excludes` line keeps xcodegen from also adding `Resources/**` as compiled source.

- [ ] **Step 3:** Edit `Sources/Margin/Persistence/UserDefaultsKeys.swift` to declare the new keys:

```swift
import Foundation

enum UserDefaultsKeys {
    static let vaultBookmark = "vaultBookmark"
    static let lastSelectedNotePath = "lastSelectedNotePath"
    static let windowFrame = "windowFrame"
    static let sidebarWidth = "sidebarWidth"
    static let noteListWidth = "noteListWidth"
    static let themeMode = "themeMode"           // "dark" | "light"
    static let themeAccent = "themeAccent"       // 0..4 (only 0 used in M3.5)
    static let editorFontKey = "editorFontKey"   // "sans" | "mono" | "serif" | "system"
    static let editorFontSize = "editorFontSize" // Double
}
```

- [ ] **Step 4:** Regenerate the Xcode project and verify it still builds.

Run: `xcodegen && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build -quiet`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Resources project.yml Sources/Margin/Persistence/UserDefaultsKeys.swift
git commit -m "chore(theme): scaffold Resources/Fonts/ and theme UserDefaults keys"
```

---

## Task 2: Palette.swift — oklch → sRGB math + dark/light tables

**Files:**
- Create: `Sources/Margin/Theme/Palette.swift`
- Test: `Tests/MarginTests/PaletteTests.swift`

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/PaletteTests.swift`:

```swift
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
        var dummy: CGFloat = 0
        p.accent.getRed(&dummy, green: &dummy, blue: &dummy, alpha: &aFull)
        p.accentSoft.getRed(&dummy, green: &dummy, blue: &dummy, alpha: &aSoft)
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
```

- [ ] **Step 2:** Run the tests — expect to fail with "cannot find Palette in scope".

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/PaletteTests -quiet`
Expected: build fails (Palette undefined).

- [ ] **Step 3:** Implement `Sources/Margin/Theme/Palette.swift`:

```swift
import AppKit
import Foundation

/// Color palette derived from oklch tokens in the design mockup (margin.css :root).
/// All colors are constructed from oklch at runtime; alphas use NSColor.withAlphaComponent.
struct Palette {

    // MARK: - Tokens

    let bg: NSColor
    let bgPanel: NSColor
    let bgElev: NSColor
    let bgHover: NSColor
    let border: NSColor
    let borderSoft: NSColor
    let text: NSColor
    let textDim: NSColor
    let textFaint: NSColor
    let accent: NSColor
    let accentInk: NSColor
    let accentSoft: NSColor  // accent.withAlphaComponent(0.14)
    let accentLine: NSColor  // accent.withAlphaComponent(0.32)
    let selection: NSColor   // accent.withAlphaComponent(0.20)

    // Legacy hex roles kept for compatibility with current MarkdownStyler logic
    // until block-chrome work in M3.8 replaces them.
    let linkBlue: NSColor    // [[wiki]] and [label](url)
    let tagPurple: NSColor   // #tag
    let codeBackground: NSColor
    let quoteBar: NSColor
    let hiddenSyntax: NSColor // NSColor.clear

    // MARK: - Accent options (only warmGold ships in M3.5)

    enum Accent: Int, CaseIterable {
        case warmGold = 0
        case terracotta = 1
        case indigo = 2
        case moss = 3
        case violet = 4

        /// (L, C, H) for the accent stroke color in dark mode.
        var darkOklch: (Double, Double, Double) {
            switch self {
            case .warmGold:   return (0.82, 0.11, 90)
            case .terracotta: return (0.72, 0.13, 35)
            case .indigo:     return (0.72, 0.13, 270)
            case .moss:       return (0.72, 0.10, 145)
            case .violet:     return (0.72, 0.13, 305)
            }
        }

        /// (L, C, H) for light mode.
        var lightOklch: (Double, Double, Double) {
            switch self {
            case .warmGold:   return (0.60, 0.12, 70)
            case .terracotta: return (0.55, 0.15, 35)
            case .indigo:     return (0.55, 0.15, 270)
            case .moss:       return (0.55, 0.12, 145)
            case .violet:     return (0.55, 0.15, 305)
            }
        }
    }

    // MARK: - Factories

    static func dark(accent: Accent) -> Palette {
        let acc = oklch(l: accent.darkOklch.0, c: accent.darkOklch.1, h: accent.darkOklch.2)
        return Palette(
            bg:          oklch(l: 0.165, c: 0.006, h: 70),
            bgPanel:     oklch(l: 0.205, c: 0.006, h: 70),
            bgElev:      oklch(l: 0.245, c: 0.007, h: 70),
            bgHover:     oklch(l: 0.275, c: 0.008, h: 70),
            border:      oklch(l: 0.305, c: 0.006, h: 70),
            borderSoft:  oklch(l: 0.255, c: 0.006, h: 70),
            text:        oklch(l: 0.905, c: 0.01,  h: 85),
            textDim:     oklch(l: 0.66,  c: 0.01,  h: 80),
            textFaint:   oklch(l: 0.49,  c: 0.01,  h: 80),
            accent:      acc,
            accentInk:   oklch(l: 0.30,  c: 0.05,  h: 80),
            accentSoft:  acc.withAlphaComponent(0.14),
            accentLine:  acc.withAlphaComponent(0.32),
            selection:   acc.withAlphaComponent(0.20),
            linkBlue:    NSColor(red: 0x4A/255, green: 0x90/255, blue: 0xE2/255, alpha: 1.0),
            tagPurple:   NSColor(red: 0x58/255, green: 0x56/255, blue: 0xD6/255, alpha: 1.0),
            codeBackground: oklch(l: 0.245, c: 0.007, h: 70),
            quoteBar:    acc.withAlphaComponent(0.32),
            hiddenSyntax: .clear
        )
    }

    static func light(accent: Accent) -> Palette {
        let acc = oklch(l: accent.lightOklch.0, c: accent.lightOklch.1, h: accent.lightOklch.2)
        return Palette(
            bg:          oklch(l: 0.975, c: 0.005, h: 85),
            bgPanel:     oklch(l: 0.945, c: 0.007, h: 85),
            bgElev:      oklch(l: 0.995, c: 0.003, h: 85),
            bgHover:     oklch(l: 0.915, c: 0.009, h: 85),
            border:      oklch(l: 0.875, c: 0.008, h: 85),
            borderSoft:  oklch(l: 0.915, c: 0.007, h: 85),
            text:        oklch(l: 0.265, c: 0.012, h: 75),
            textDim:     oklch(l: 0.46,  c: 0.012, h: 75),
            textFaint:   oklch(l: 0.64,  c: 0.012, h: 75),
            accent:      acc,
            accentInk:   oklch(l: 0.99,  c: 0.02,  h: 90),
            accentSoft:  acc.withAlphaComponent(0.12),
            accentLine:  acc.withAlphaComponent(0.30),
            selection:   acc.withAlphaComponent(0.18),
            linkBlue:    NSColor(red: 0x4A/255, green: 0x90/255, blue: 0xE2/255, alpha: 1.0),
            tagPurple:   NSColor(red: 0x58/255, green: 0x56/255, blue: 0xD6/255, alpha: 1.0),
            codeBackground: oklch(l: 0.945, c: 0.007, h: 85),
            quoteBar:    acc.withAlphaComponent(0.30),
            hiddenSyntax: .clear
        )
    }

    // MARK: - oklch → sRGB

    /// Convert oklch (Björn Ottosson, 2020) to an sRGB-space NSColor.
    /// L, C in 0..1; H in degrees. Alpha defaults to 1.0.
    /// Reference: https://bottosson.github.io/posts/oklab/
    static func oklch(l: Double, c: Double, h: Double, alpha: Double = 1.0) -> NSColor {
        let hRad = h * .pi / 180.0
        let aLab = c * cos(hRad)
        let bLab = c * sin(hRad)

        // oklab → linear sRGB
        let l_ = l + 0.3963377774 * aLab + 0.2158037573 * bLab
        let m_ = l - 0.1055613458 * aLab - 0.0638541728 * bLab
        let s_ = l - 0.0894841775 * aLab - 1.2914855480 * bLab

        let lCubed = l_ * l_ * l_
        let mCubed = m_ * m_ * m_
        let sCubed = s_ * s_ * s_

        var rLin =  4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
        var gLin = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
        var bLin = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed

        // Clamp to gamut (a rough but adequate approach for our palette).
        rLin = max(0, min(1, rLin))
        gLin = max(0, min(1, gLin))
        bLin = max(0, min(1, bLin))

        // Linear → sRGB gamma
        func encode(_ x: Double) -> Double {
            return x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1.0 / 2.4) - 0.055
        }

        return NSColor(srgbRed: CGFloat(encode(rLin)),
                       green:   CGFloat(encode(gLin)),
                       blue:    CGFloat(encode(bLin)),
                       alpha:   CGFloat(alpha))
    }
}
```

- [ ] **Step 4:** Regenerate project and run the test, expect all tests pass.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/PaletteTests -quiet`
Expected: `Test Suite 'PaletteTests' passed`.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Theme/Palette.swift Tests/MarginTests/PaletteTests.swift
git commit -m "feat(theme): Palette with oklch tokens for dark/light + 5 accents"
```

---

## Task 3: FontStack.swift — IBM Plex registration + lookup

**Files:**
- Create: `Sources/Margin/Theme/FontStack.swift`
- Test: `Tests/MarginTests/FontStackTests.swift`

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/FontStackTests.swift`:

```swift
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
```

- [ ] **Step 2:** Verify tests fail (`FontStack` undefined). Run:

`xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/FontStackTests -quiet`
Expected: build error.

- [ ] **Step 3:** Implement `Sources/Margin/Theme/FontStack.swift`:

```swift
import AppKit
import CoreText
import Foundation

/// Resolves UI / mono / serif fonts. Registers any IBM Plex .ttf files bundled
/// under Resources/Fonts/ at startup; if a face isn't available the system
/// font for that role is returned instead — the app keeps running.
enum FontStack {

    enum Weight {
        case regular   // 400
        case medium    // 500
        case semibold  // 600
        case bold      // 700

        var ns: NSFont.Weight {
            switch self {
            case .regular: return .regular
            case .medium: return .medium
            case .semibold: return .semibold
            case .bold: return .bold
            }
        }
    }

    private static var didRegister = false
    private static let lock = NSLock()

    /// Register every .ttf inside the bundle's Fonts/ subdirectory.
    /// Safe to call repeatedly; no-op after the first successful call.
    static func register() {
        lock.lock(); defer { lock.unlock() }
        guard !didRegister else { return }
        didRegister = true

        let bundle = Bundle.main
        let candidates = (bundle.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? [])
            + (bundle.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
        let unique = Array(Set(candidates))
        for url in unique {
            var err: Unmanaged<CFError>?
            // Ignore failures (already registered, missing, etc).
            _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &err)
        }
    }

    // MARK: - Lookup

    static func ui(size: CGFloat, weight: Weight = .regular, italic: Bool = false) -> NSFont {
        let face = italic
            ? plexFaceName(family: "IBM Plex Sans", weight: weight, italic: true)
            : plexFaceName(family: "IBM Plex Sans", weight: weight, italic: false)
        if let f = NSFont(name: face, size: size) { return f }
        let sys = NSFont.systemFont(ofSize: size, weight: weight.ns)
        if italic {
            return NSFontManager.shared.convert(sys, toHaveTrait: .italicFontMask)
        }
        return sys
    }

    static func mono(size: CGFloat, weight: Weight = .regular) -> NSFont {
        let face = plexFaceName(family: "IBM Plex Mono", weight: weight, italic: false)
        if let f = NSFont(name: face, size: size) { return f }
        return NSFont.monospacedSystemFont(ofSize: size, weight: weight.ns)
    }

    static func serif(size: CGFloat, weight: Weight = .regular) -> NSFont {
        let face = plexFaceName(family: "IBM Plex Serif", weight: weight, italic: false)
        if let f = NSFont(name: face, size: size) { return f }
        // System serif fallback: Times New Roman is universally present.
        if let f = NSFont(name: "Times New Roman", size: size) { return f }
        return NSFont.systemFont(ofSize: size, weight: weight.ns)
    }

    // MARK: - Name construction

    private static func plexFaceName(family: String, weight: Weight, italic: Bool) -> String {
        let weightSuffix: String = {
            switch weight {
            case .regular: return italic ? "Italic" : "Regular"
            case .medium: return italic ? "MediumItalic" : "Medium"
            case .semibold: return italic ? "SemiBoldItalic" : "SemiBold"
            case .bold: return italic ? "BoldItalic" : "Bold"
            }
        }()
        // PostScript names follow the pattern "IBMPlexSans-Regular".
        let compact = family.replacingOccurrences(of: " ", with: "")
        return "\(compact)-\(weightSuffix)"
    }
}
```

- [ ] **Step 4:** Run the tests, expect pass.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/FontStackTests -quiet`
Expected: `Test Suite 'FontStackTests' passed`.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Theme/FontStack.swift Tests/MarginTests/FontStackTests.swift
git commit -m "feat(theme): FontStack resolves IBM Plex with graceful system fallback"
```

---

## Task 4: ThemeStore.swift — observable + persistence

**Files:**
- Create: `Sources/Margin/Theme/ThemeStore.swift`
- Test: `Tests/MarginTests/ThemeStoreTests.swift`

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/ThemeStoreTests.swift`:

```swift
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
```

- [ ] **Step 2:** Verify tests fail (`ThemeStore` undefined).

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/ThemeStoreTests -quiet`
Expected: build fails.

- [ ] **Step 3:** Implement `Sources/Margin/Theme/ThemeStore.swift`:

```swift
import AppKit
import Foundation
import SwiftUI

@MainActor
final class ThemeStore: ObservableObject {

    enum Mode: String { case dark, light }
    enum FontKey: String { case sans, mono, serif, system }

    @Published var mode: Mode {
        didSet {
            UserDefaults.standard.set(mode.rawValue, forKey: UserDefaultsKeys.themeMode)
            rebuildPalette()
        }
    }

    @Published var accent: Palette.Accent {
        didSet {
            UserDefaults.standard.set(accent.rawValue, forKey: UserDefaultsKeys.themeAccent)
            rebuildPalette()
        }
    }

    @Published var fontKey: FontKey {
        didSet { UserDefaults.standard.set(fontKey.rawValue, forKey: UserDefaultsKeys.editorFontKey) }
    }

    @Published var fontSize: Double {
        didSet { UserDefaults.standard.set(fontSize, forKey: UserDefaultsKeys.editorFontSize) }
    }

    /// Current resolved palette. Recomputed when mode or accent changes.
    @Published private(set) var palette: Palette

    init() {
        let d = UserDefaults.standard
        let mode = Mode(rawValue: d.string(forKey: UserDefaultsKeys.themeMode) ?? "") ?? .dark
        let accent = Palette.Accent(rawValue: d.integer(forKey: UserDefaultsKeys.themeAccent)) ?? .warmGold
        let key = FontKey(rawValue: d.string(forKey: UserDefaultsKeys.editorFontKey) ?? "") ?? .sans
        let storedSize = d.double(forKey: UserDefaultsKeys.editorFontSize)
        self.mode = mode
        self.accent = accent
        self.fontKey = key
        self.fontSize = storedSize > 0 ? storedSize : 16
        self.palette = (mode == .dark)
            ? Palette.dark(accent: accent)
            : Palette.light(accent: accent)
    }

    func toggleMode() {
        mode = (mode == .dark) ? .light : .dark
    }

    private func rebuildPalette() {
        palette = (mode == .dark)
            ? Palette.dark(accent: accent)
            : Palette.light(accent: accent)
    }
}
```

- [ ] **Step 4:** Run tests, expect pass.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/ThemeStoreTests -quiet`
Expected: `Test Suite 'ThemeStoreTests' passed`.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Theme/ThemeStore.swift Tests/MarginTests/ThemeStoreTests.swift
git commit -m "feat(theme): ThemeStore observable + UserDefaults persistence"
```

---

## Task 5: Typography reads from Palette + FontStack

**Files:**
- Modify: `Sources/Margin/Editor/Typography.swift`
- Modify: `Tests/MarginTests/MarkdownStylerTests.swift` (already uses `Typography.current()`, kept working)

The MarkdownStyler signature `style(_:activeRange:typography:)` stays unchanged. Only Typography's *construction* moves: `current()` builds from default dark theme; a new `from(palette:size:fontKey:)` builds from a runtime ThemeStore snapshot.

- [ ] **Step 1:** Replace `Sources/Margin/Editor/Typography.swift` with:

```swift
import AppKit

/// All fonts and colors used by MarkdownStyler.
/// Build with `Typography.from(palette:size:fontKey:)` at runtime;
/// `current()` returns the default-theme value for tests and as a fallback.
struct Typography {
    // MARK: Fonts
    let body: NSFont
    let bodyBold: NSFont
    let bodyItalic: NSFont
    let mono: NSFont
    let h1: NSFont
    let h2: NSFont
    let h3: NSFont
    let h4: NSFont    // used for H4-H6

    // MARK: Colors
    let primaryText: NSColor
    let secondaryText: NSColor
    let tertiaryText: NSColor
    let linkBlue: NSColor
    let tagPurple: NSColor
    let codeBackground: NSColor
    let quoteBar: NSColor
    let hiddenSyntax: NSColor

    // MARK: Background (NEW — editor area uses this)
    let editorBackground: NSColor

    // MARK: Paragraph metrics
    let bodyLineHeightMultiplier: CGFloat = 1.72
    let bodyParagraphSpacing: CGFloat = 8

    /// Default-theme Typography (dark + warm gold + IBM Plex sans 16pt).
    /// Used by tests and as the fallback before ThemeStore is wired.
    static func current() -> Typography {
        return from(palette: Palette.dark(accent: .warmGold),
                    size: 16,
                    fontKey: .sans)
    }

    /// Build Typography from a runtime palette + size + font family choice.
    static func from(palette p: Palette,
                     size: CGFloat,
                     fontKey: ThemeStore.FontKey) -> Typography {
        let bodyFont: NSFont
        let monoFont = FontStack.mono(size: size - 2.5)
        switch fontKey {
        case .sans:
            bodyFont = FontStack.ui(size: size, weight: .regular)
        case .mono:
            bodyFont = FontStack.mono(size: size)
        case .serif:
            bodyFont = FontStack.serif(size: size, weight: .regular)
        case .system:
            bodyFont = NSFont.systemFont(ofSize: size)
        }

        // Italic via FontStack so IBM Plex Italic is picked up when present.
        let italic: NSFont = {
            if fontKey == .sans {
                return FontStack.ui(size: size, weight: .regular, italic: true)
            }
            return NSFontManager.shared.convert(bodyFont, toHaveTrait: .italicFontMask)
        }()
        let bold: NSFont = {
            if fontKey == .sans {
                return FontStack.ui(size: size, weight: .semibold)
            }
            return NSFontManager.shared.convert(bodyFont, toHaveTrait: .boldFontMask)
        }()

        let h1 = (fontKey == .sans)
            ? FontStack.ui(size: size * 1.62, weight: .semibold)
            : NSFont.systemFont(ofSize: size * 1.62, weight: .bold)
        let h2 = (fontKey == .sans)
            ? FontStack.ui(size: size * 1.32, weight: .semibold)
            : NSFont.systemFont(ofSize: size * 1.32, weight: .bold)
        let h3 = (fontKey == .sans)
            ? FontStack.ui(size: size * 1.10, weight: .semibold)
            : NSFont.systemFont(ofSize: size * 1.10, weight: .bold)
        let h4 = (fontKey == .sans)
            ? FontStack.ui(size: size * 1.05, weight: .medium)
            : NSFont.systemFont(ofSize: size * 1.05, weight: .semibold)

        return Typography(
            body: bodyFont,
            bodyBold: bold,
            bodyItalic: italic,
            mono: monoFont,
            h1: h1, h2: h2, h3: h3, h4: h4,
            primaryText:    p.text,
            secondaryText:  p.textDim,
            tertiaryText:   p.textFaint,
            linkBlue:       p.accent,            // wiki/links now use accent (gold)
            tagPurple:      p.tagPurple,         // tag keeps purple (visual distinction)
            codeBackground: p.codeBackground,
            quoteBar:       p.accent.withAlphaComponent(0.55),
            hiddenSyntax:   p.hiddenSyntax,
            editorBackground: p.bg
        )
    }

    /// Returns the right font for an H1..H6 level.
    func headingFont(level: Int) -> NSFont {
        switch level {
        case 1: return h1
        case 2: return h2
        case 3: return h3
        default: return h4
        }
    }
}
```

- [ ] **Step 2:** Existing `MarkdownStylerTests` references `Typography.current()` and assumes `linkBlue` is the old hex blue. Audit the assertions. Read `Tests/MarginTests/MarkdownStylerTests.swift` and adjust any test that compares `typo.linkBlue` against a hardcoded hex — the new value is `palette.accent`. The structural assertions (link runs use `typo.linkBlue`) still hold because both sides re-read `typo.linkBlue`.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/MarkdownStylerTests -quiet`
Expected: passes if no hard-coded hex compares; if a test fails, replace the hard-coded color expectation with `typo.linkBlue` (which now equals accent).

- [ ] **Step 3:** Confirm the broader suite still passes.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
Expected: all tests pass.

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/Editor/Typography.swift Tests/MarginTests/MarkdownStylerTests.swift
git commit -m "refactor(theme): Typography built from Palette+FontStack; current() = default dark"
```

---

## Task 6: Register fonts at launch + own a ThemeStore at the app root

**Files:**
- Modify: `Sources/Margin/MarginApp.swift`
- Modify: `Sources/Margin/UI/RootView.swift`

- [ ] **Step 1:** Read the current `MarginApp.swift` to confirm structure, then edit it. After the edit it should look like:

```swift
import SwiftUI

@main
struct MarginApp: App {
    @StateObject private var state = AppState()
    @StateObject private var theme = ThemeStore()

    init() {
        FontStack.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .environmentObject(theme)
                .onAppear { state.loadStoredVault() }
        }
    }
}
```

(If the existing `MarginApp.swift` has additional logic — e.g., `Settings` scene, window commands — preserve it; only add the `theme` StateObject, the `init() { FontStack.register() }`, and the second `.environmentObject(theme)` line.)

- [ ] **Step 2:** Edit `Sources/Margin/UI/RootView.swift` to pass `theme` through any sheet that needs it. After change:

```swift
import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        Group {
            if state.vaultRoot == nil {
                NoVaultView(onChoose: { state.chooseVault() })
            } else {
                ThreePaneView()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .preferredColorScheme(theme.mode == .dark ? .dark : .light)
        .sheet(isPresented: $state.searchSheetVisible) {
            SearchSheet()
                .environmentObject(state)
                .environmentObject(theme)
        }
    }
}
```

(The `ThreePaneView` already inherits `theme` via `@EnvironmentObject` when needed in later tasks.)

- [ ] **Step 3:** Build and run a quick sanity check.

Run: `xcodegen >/dev/null && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build -quiet`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/MarginApp.swift Sources/Margin/UI/RootView.swift
git commit -m "feat(theme): register fonts at launch; ThemeStore in environment + window colorScheme"
```

---

## Task 7: Theme toggle button + editor uses Palette colors + re-style on theme change

**Files:**
- Modify: `Sources/Margin/UI/EditorView.swift`

`EditorView`'s embedded `MarkdownEditor` currently hardcodes `Color(NSColor.textBackgroundColor)` for the background and builds `Typography.current()` once per Coordinator. Both need to read from `ThemeStore`. The `EditorToolbar` gets a sun/moon toggle button next to the dirty dot.

- [ ] **Step 1:** Replace `Sources/Margin/UI/EditorView.swift` with:

```swift
import SwiftUI
import AppKit

struct EditorView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        Group {
            if state.selectedNoteURL == nil {
                NoNoteSelectedView()
            } else {
                VStack(spacing: 0) {
                    EditorToolbar()
                    MarkdownEditor(text: $state.noteBody,
                                   onChange: { state.bodyChanged() })
                    .background(Color(theme.palette.bg))
                }
            }
        }
    }
}

private struct EditorToolbar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 8) {
            if let url = state.selectedNoteURL {
                Text(url.deletingPathExtension().lastPathComponent)
                    .font(.headline)
                    .foregroundStyle(Color(theme.palette.text))
            }
            if state.dirty {
                Circle()
                    .fill(Color(theme.palette.accent))
                    .frame(width: 8, height: 8)
                    .help("Unsaved changes")
            }
            Spacer()
            Button(action: { theme.toggleMode() }) {
                Image(systemName: theme.mode == .dark ? "sun.max" : "moon")
                    .foregroundStyle(Color(theme.palette.textDim))
            }
            .buttonStyle(.plain)
            .help("Toggle theme")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(theme.palette.bgPanel))
        .overlay(Divider().background(Color(theme.palette.borderSoft)),
                 alignment: .bottom)
    }
}

private struct MarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    let onChange: () -> Void
    @EnvironmentObject var theme: ThemeStore

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let tv = scroll.documentView as? NSTextView else { return scroll }
        tv.delegate = context.coordinator
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isRichText = true
        tv.usesRuler = false
        tv.usesInspectorBar = false
        tv.allowsUndo = true
        tv.textContainerInset = NSSize(width: 48, height: 32)
        tv.backgroundColor = theme.palette.bg
        tv.insertionPointColor = theme.palette.accent
        tv.selectedTextAttributes = [
            .backgroundColor: theme.palette.selection
        ]
        context.coordinator.typography = Typography.from(palette: theme.palette,
                                                         size: CGFloat(theme.fontSize),
                                                         fontKey: theme.fontKey)
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        let newTypo = Typography.from(palette: theme.palette,
                                      size: CGFloat(theme.fontSize),
                                      fontKey: theme.fontKey)
        let typoChanged = context.coordinator.typography.body != newTypo.body
            || context.coordinator.typography.primaryText != newTypo.primaryText
            || context.coordinator.typography.editorBackground != newTypo.editorBackground
        context.coordinator.typography = newTypo
        if typoChanged {
            tv.backgroundColor = newTypo.editorBackground
            tv.insertionPointColor = theme.palette.accent
            tv.selectedTextAttributes = [.backgroundColor: theme.palette.selection]
        }
        context.coordinator.syncIfNeeded(tv: tv, externalText: text, forceRestyle: typoChanged)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: MarkdownEditor
        var typography = Typography.current()
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        func syncIfNeeded(tv: NSTextView, externalText: String, forceRestyle: Bool = false) {
            if tv.string != externalText {
                let savedSelection = tv.selectedRange()
                suppressDelegate = true
                let styled = makeAttributed(text: externalText, cursor: 0)
                tv.textStorage?.setAttributedString(styled)
                let clampedLoc = min(savedSelection.location, externalText.utf16.count)
                tv.setSelectedRange(NSRange(location: clampedLoc, length: 0))
                suppressDelegate = false
            } else if forceRestyle {
                applyAttributes(tv: tv)
            } else {
                applyAttributes(tv: tv)
            }
        }

        func applyAttributes(tv: NSTextView) {
            let selection = tv.selectedRange()
            let cursor = selection.location
            let styled = makeAttributed(text: tv.string, cursor: cursor)
            suppressDelegate = true
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(selection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, cursor: Int) -> NSAttributedString {
            let active = ActiveParagraph.range(in: text, cursor: cursor)
            let activeOrNil: NSRange? = active.length > 0 ? active : nil
            return MarkdownStyler.style(text, activeRange: activeOrNil, typography: typography)
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            parent.text = tv.string
            parent.onChange()
            applyAttributes(tv: tv)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            applyAttributes(tv: tv)
        }
    }
}
```

- [ ] **Step 2:** Build and run the whole test suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
Expected: all tests pass.

- [ ] **Step 3:** Commit.

```bash
git add Sources/Margin/UI/EditorView.swift
git commit -m "feat(theme): EditorView reads Palette; theme toggle button; re-style on theme change"
```

---

## Task 8: Manual smoke verification

**Files:**
- Create: `docs/M3.5-verification.md`

- [ ] **Step 1:** Run the app, exercise the theme toggle, and confirm every checkbox in the verification doc. Write `docs/M3.5-verification.md`:

```markdown
# M3.5 — Theme system verification

Run `xcodegen && open Margin.xcodeproj`, build & launch, open any note, then check:

## Visual baseline (dark, default)
- [ ] Editor pane background is near-black with a warm tint (oklch 0.165 / 0.006 / 70)
- [ ] Editor body text is near-white (`palette.text`)
- [ ] Editor toolbar background is one shade lighter than editor body (`palette.bgPanel`)
- [ ] The note title in the toolbar is fully visible
- [ ] A `[[wiki]]` or `[label](url)` link renders in warm gold (accent)
- [ ] An inline `#tag` still renders in purple (intentional visual distinction)
- [ ] Inline `code` has a subtle dark background
- [ ] Blockquote (`> text`) still shows the gold-ish `>` marker and dimmed body
- [ ] Caret blinks in warm gold; selection background is translucent gold

## Toggle behavior
- [ ] Click the sun/moon button in the editor toolbar
- [ ] Editor instantly switches to light mode (cream background, dark text)
- [ ] All inline rendering (heading sizes, bold, italic, links, tags) still works
- [ ] Quit the app, relaunch — light mode persists
- [ ] Toggle back → dark mode persists

## Active-paragraph behavior (M3 regression)
- [ ] Click on a heading line → the `#` markers become visible (`palette.text`)
- [ ] Click on a `**bold**` line → the `**` markers become visible
- [ ] Move the caret away → markers disappear (color = `.clear`)

## Fonts
With **no IBM Plex .ttf files** in `Sources/Margin/Resources/Fonts/`:
- [ ] App launches; body text renders in San Francisco (system fallback)

After dropping `IBMPlexSans-Regular.ttf` + `IBMPlexSans-SemiBold.ttf` into the folder
and rebuilding:
- [ ] Relaunch — body text now renders in IBM Plex Sans (visible weight + shape change)

## Unit tests
Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
- [ ] All tests pass (Palette / FontStack / ThemeStore + existing M1–M3)
```

- [ ] **Step 2:** Walk the entire checklist manually. Fix any failures inline (most likely culprits: missing `.environmentObject(theme)` on a new view, or a stale `Typography.current()` call somewhere — `grep -r "Typography.current()" Sources/` should return only the in-file `current()` definition and the test file).

- [ ] **Step 3:** Commit the verification doc.

```bash
git add docs/M3.5-verification.md
git commit -m "docs(theme): M3.5 verification checklist"
```

---

## Self-review checklist

After every task lands, run through this once:

- **Spec coverage:** §3.1 palette → Task 2; §3.2 fonts → Task 3; §3.3 sizes → Task 5 (em-based scaling preserved); §3.4 persistence → Tasks 1+4; §9 interim toggle location → Task 7.
- **Placeholder scan:** confirmed none — every step has concrete code or an exact command.
- **Type consistency:** `Palette.Accent`, `ThemeStore.Mode`, `ThemeStore.FontKey`, `Typography.from(palette:size:fontKey:)` — names match across all tasks.
- **No new test files for `Typography`** intentionally (passive value type, covered transitively by MarkdownStylerTests).

After M3.5 lands, the next plan is M3.6 (TitleBar + StatusBar + StatsCalculator); it depends on the `ThemeStore` injected by this plan.
