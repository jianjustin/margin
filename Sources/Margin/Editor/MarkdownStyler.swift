import Foundation
import AppKit
import Markdown

enum MarkdownStyler {
    /// Build an NSAttributedString styling `text`. If `activeRange` is non-nil, syntax markers
    /// inside it remain visible (primaryText color); markers outside become hidden (clear).
    static func style(_ text: String,
                      activeRange: NSRange?,
                      typography typo: Typography) -> NSAttributedString {
        let m = NSMutableAttributedString(string: text)
        let full = NSRange(location: 0, length: (text as NSString).length)

        // Defaults.
        m.addAttribute(.font, value: typo.body, range: full)
        m.addAttribute(.foregroundColor, value: typo.primaryText, range: full)

        // Apply paragraph metrics to the entire document.
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineHeightMultiple = typo.bodyLineHeightMultiplier
        paragraph.paragraphSpacing = typo.bodyParagraphSpacing
        m.addAttribute(.paragraphStyle, value: paragraph, range: full)

        let doc = Document(parsing: text)
        for child in doc.children {
            visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
        }
        applyInlineRegexPasses(in: m, text: text, typo: typo, activeRange: activeRange)
        return m
    }

    // MARK: - Block traversal

    private static func visit(_ markup: Markup,
                              m: NSMutableAttributedString,
                              text: String,
                              typo: Typography,
                              activeRange: NSRange?) {
        switch markup {
        case let h as Heading:
            applyHeading(h, m: m, text: text, typo: typo, activeRange: activeRange)
        case let q as BlockQuote:
            applyQuote(q, m: m, text: text, typo: typo)
            for c in q.children { visit(c, m: m, text: text, typo: typo, activeRange: activeRange) }
        case let cb as CodeBlock:
            applyCodeBlock(cb, m: m, text: text, typo: typo)
        case let p as Paragraph:
            applyInlines(in: p, m: m, text: text, typo: typo, activeRange: activeRange)
        default:
            for c in markup.children {
                visit(c, m: m, text: text, typo: typo, activeRange: activeRange)
            }
        }
    }

    private static func applyHeading(_ h: Heading,
                                     m: NSMutableAttributedString,
                                     text: String,
                                     typo: Typography,
                                     activeRange: NSRange?) {
        guard let sr = h.range,
              let lineRange = RangeConverter.nsRange(of: sr, in: text) else { return }
        let font = typo.headingFont(level: h.level)
        m.addAttribute(.font, value: font, range: lineRange)

        // Hide the leading "# " (or "## " etc.) when not active.
        let hashCount = h.level
        let prefixLength = hashCount + 1  // "# " = hashCount + 1 space
        let prefixRange = NSRange(location: lineRange.location,
                                  length: min(prefixLength, lineRange.length))
        let color = isFullyInside(prefixRange, of: activeRange) ? typo.primaryText : typo.hiddenSyntax
        m.addAttribute(.foregroundColor, value: color, range: prefixRange)

        // Recurse into inlines inside the heading.
        for child in h.children {
            visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
        }
    }

    private static func applyQuote(_ q: BlockQuote,
                                   m: NSMutableAttributedString,
                                   text: String,
                                   typo: Typography) {
        guard let sr = q.range,
              let r = RangeConverter.nsRange(of: sr, in: text) else { return }
        // Dim quote body.
        m.addAttribute(.foregroundColor, value: typo.secondaryText, range: r)
        // Indent + accent: paint the leading "> " of each line in the quote with the quoteBar color.
        let ns = m.string as NSString
        var idx = r.location
        let end = r.location + r.length
        while idx < end {
            // At idx, look for "> " at start of a line.
            if idx == r.location || ns.character(at: idx - 1) == 0x0A {
                if idx < end && ns.character(at: idx) == UInt16(UnicodeScalar(">").value) {
                    let markerLength = (idx + 1 < end && ns.character(at: idx + 1) == 0x20) ? 2 : 1
                    let markerRange = NSRange(location: idx, length: markerLength)
                    m.addAttribute(.foregroundColor, value: typo.quoteBar, range: markerRange)
                }
            }
            idx += 1
        }
        // Apply hanging indent to align continuation lines with quote text.
        let p = NSMutableParagraphStyle()
        p.lineHeightMultiple = typo.bodyLineHeightMultiplier
        p.paragraphSpacing = typo.bodyParagraphSpacing
        p.headIndent = 16
        m.addAttribute(.paragraphStyle, value: p, range: r)
    }

    private static func applyCodeBlock(_ cb: CodeBlock,
                                       m: NSMutableAttributedString,
                                       text: String,
                                       typo: Typography) {
        guard let sr = cb.range,
              let r = RangeConverter.nsRange(of: sr, in: text) else { return }
        m.addAttribute(.font, value: typo.mono, range: r)
        m.addAttribute(.backgroundColor, value: typo.codeBackground, range: r)
    }

    private static func applyInlines(in paragraph: Paragraph,
                                     m: NSMutableAttributedString,
                                     text: String,
                                     typo: Typography,
                                     activeRange: NSRange?) {
        for child in paragraph.children {
            if let inline = child as? InlineMarkup {
                applyInline(inline, m: m, text: text, typo: typo, activeRange: activeRange)
            } else {
                visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
            }
        }
    }

    private static func applyInline(_ inline: InlineMarkup,
                                    m: NSMutableAttributedString,
                                    text: String,
                                    typo: Typography,
                                    activeRange: NSRange?) {
        switch inline {
        case let s as Strong:
            if let sr = s.range,
               let r = RangeConverter.nsRange(of: sr, in: text) {
                m.addAttribute(.font, value: typo.bodyBold, range: r)
                hideMarkers(in: r, of: m, count: 2, visibleColor: typo.primaryText,
                            typo: typo, activeRange: activeRange)
            }
        case let e as Emphasis:
            if let sr = e.range,
               let r = RangeConverter.nsRange(of: sr, in: text) {
                m.addAttribute(.font, value: typo.bodyItalic, range: r)
                hideMarkers(in: r, of: m, count: 1, visibleColor: typo.primaryText,
                            typo: typo, activeRange: activeRange)
            }
        case let ic as InlineCode:
            if let sr = ic.range,
               let r = RangeConverter.nsRange(of: sr, in: text) {
                m.addAttribute(.font, value: typo.mono, range: r)
                m.addAttribute(.backgroundColor, value: typo.codeBackground, range: r)
                hideMarkers(in: r, of: m, count: 1, visibleColor: typo.primaryText,
                            typo: typo, activeRange: activeRange)
            }
        case let l as Markdown.Link:
            if let sr = l.range,
               let r = RangeConverter.nsRange(of: sr, in: text) {
                m.addAttribute(.foregroundColor, value: typo.linkBlue, range: r)
            }
        default:
            // Recurse into any nested inline containers.
            for child in inline.children {
                if let childInline = child as? InlineMarkup {
                    applyInline(childInline, m: m, text: text, typo: typo, activeRange: activeRange)
                }
            }
        }
    }

    /// Hide `count` characters at both ends of `r` (the syntax delimiters) when outside active.
    private static func hideMarkers(in r: NSRange,
                                    of m: NSMutableAttributedString,
                                    count: Int,
                                    visibleColor: NSColor,
                                    typo: Typography,
                                    activeRange: NSRange?) {
        guard r.length >= count * 2 else { return }
        let leading = NSRange(location: r.location, length: count)
        let trailing = NSRange(location: r.location + r.length - count, length: count)
        let leadColor = isFullyInside(leading, of: activeRange) ? visibleColor : typo.hiddenSyntax
        let trailColor = isFullyInside(trailing, of: activeRange) ? visibleColor : typo.hiddenSyntax
        m.addAttribute(.foregroundColor, value: leadColor, range: leading)
        m.addAttribute(.foregroundColor, value: trailColor, range: trailing)
    }

    private static func isFullyInside(_ inner: NSRange, of outer: NSRange?) -> Bool {
        guard let outer else { return false }
        return inner.location >= outer.location &&
               (inner.location + inner.length) <= (outer.location + outer.length)
    }

    // MARK: - Inline regex passes (wiki links + inline tags)

    private static let wikiLinkRegex = try! NSRegularExpression(
        pattern: #"\[\[([^\[\]\n]+?)\]\]"#
    )
    private static let inlineTagRegex = try! NSRegularExpression(
        pattern: #"(?<![\w/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)"#
    )

    private static func applyInlineRegexPasses(in m: NSMutableAttributedString,
                                               text: String,
                                               typo: Typography,
                                               activeRange: NSRange?) {
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)

        wikiLinkRegex.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let mr = match else { return }
            let outer = mr.range
            // Whole match gets link color first, then markers may be re-hidden.
            m.addAttribute(.foregroundColor, value: typo.linkBlue, range: outer)
            if outer.length >= 4 {
                let lead = NSRange(location: outer.location, length: 2)
                let trail = NSRange(location: outer.location + outer.length - 2, length: 2)
                let leadColor = isFullyInside(lead, of: activeRange) ? typo.linkBlue : typo.hiddenSyntax
                let trailColor = isFullyInside(trail, of: activeRange) ? typo.linkBlue : typo.hiddenSyntax
                m.addAttribute(.foregroundColor, value: leadColor, range: lead)
                m.addAttribute(.foregroundColor, value: trailColor, range: trail)
            }
        }

        inlineTagRegex.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let mr = match else { return }
            let outer = mr.range
            let hashRange = NSRange(location: outer.location, length: 1)
            let slugRange = NSRange(location: outer.location + 1, length: outer.length - 1)
            m.addAttribute(.foregroundColor, value: typo.tagPurple, range: slugRange)
            let hashColor = isFullyInside(hashRange, of: activeRange) ? typo.tagPurple : typo.hiddenSyntax
            m.addAttribute(.foregroundColor, value: hashColor, range: hashRange)
        }
    }
}
