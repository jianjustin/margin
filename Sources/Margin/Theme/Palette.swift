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
