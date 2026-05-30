import AppKit

/// All fonts and colors used by MarkdownStyler.
/// Resolve via `Typography.current()` for the active appearance.
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

    // MARK: Paragraph metrics
    let bodyLineHeightMultiplier: CGFloat = 1.55
    let bodyParagraphSpacing: CGFloat = 8

    static func current() -> Typography {
        let body = NSFont.systemFont(ofSize: 16)
        let bodyBold = NSFontManager.shared.convert(body, toHaveTrait: .boldFontMask)
        let bodyItalic = NSFontManager.shared.convert(body, toHaveTrait: .italicFontMask)
        let mono = NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)

        return Typography(
            body: body,
            bodyBold: bodyBold,
            bodyItalic: bodyItalic,
            mono: mono,
            h1: NSFont.systemFont(ofSize: 28, weight: .bold),
            h2: NSFont.systemFont(ofSize: 24, weight: .bold),
            h3: NSFont.systemFont(ofSize: 20, weight: .bold),
            h4: NSFont.systemFont(ofSize: 18, weight: .semibold),
            primaryText: NSColor.labelColor,
            secondaryText: NSColor.secondaryLabelColor,
            tertiaryText: NSColor.tertiaryLabelColor,
            linkBlue: NSColor(red: 0x4A/255, green: 0x90/255, blue: 0xE2/255, alpha: 1.0),
            tagPurple: NSColor(red: 0x58/255, green: 0x56/255, blue: 0xD6/255, alpha: 1.0),
            codeBackground: NSColor.quaternaryLabelColor.withAlphaComponent(0.18),
            quoteBar: NSColor.tertiaryLabelColor,
            hiddenSyntax: NSColor.clear
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
