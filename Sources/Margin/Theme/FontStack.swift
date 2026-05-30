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
    /// Safe to call repeatedly; no-op after the first call (regardless of
    /// per-file registration result — CTFont errors are intentionally swallowed).
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
        let face = plexFaceName(family: "IBM Plex Sans", weight: weight, italic: italic)
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
