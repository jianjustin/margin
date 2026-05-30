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
