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
