import AppKit

/// Paints a 3pt rounded accent-coloured bar along the leading edge of every
/// quote-block layout fragment, in addition to the standard text rendering.
final class QuoteBlockFragment: NSTextLayoutFragment {
    var barColor: NSColor = .systemYellow
    var handleColor: NSColor = NSColor.gray
    var isHovered: Bool = false

    override func draw(at point: CGPoint, in context: CGContext) {
        // 1. Standard text rendering.
        super.draw(at: point, in: context)

        let frame = layoutFragmentFrame

        // 2. Existing gold bar.
        let bar = CGRect(x: point.x + frame.minX,
                         y: point.y + frame.minY + 2,
                         width: 3,
                         height: max(0, frame.height - 4))
        context.saveGState()
        context.setFillColor(barColor.cgColor)
        context.addPath(CGPath(roundedRect: bar,
                               cornerWidth: 1.5, cornerHeight: 1.5,
                               transform: nil))
        context.fillPath()

        if isHovered {
            paintHandle(at: point, in: context)
        }
        context.restoreGState()
    }

    private func paintHandle(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let glyph = "⠿" as NSString
        let font = NSFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: handleColor
        ]
        let size = glyph.size(withAttributes: attrs)
        let drawPoint = CGPoint(
            x: point.x + frame.minX - 30,
            y: point.y + frame.minY + (frame.height - size.height) / 2
        )
        glyph.draw(at: drawPoint, withAttributes: attrs)
    }
}
