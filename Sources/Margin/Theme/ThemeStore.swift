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
        // integer(forKey:) returns 0 when absent; warmGold.rawValue == 0 by design.
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
