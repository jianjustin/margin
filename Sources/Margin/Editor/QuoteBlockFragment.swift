import AppKit

/// Paints a 3pt rounded accent-coloured bar along the leading edge of every
/// quote-block layout fragment, in addition to the standard text rendering.
final class QuoteBlockFragment: NSTextLayoutFragment {
    var barColor: NSColor = .systemYellow

    override func draw(at point: CGPoint, in context: CGContext) {
        // 1. Standard text rendering.
        super.draw(at: point, in: context)

        // 2. Decoration.
        let frame = layoutFragmentFrame
        let bar = CGRect(x: point.x + frame.minX,
                         y: point.y + frame.minY + 2,
                         width: 3,
                         height: max(0, frame.height - 4))
        context.saveGState()
        context.setFillColor(barColor.cgColor)
        let path = CGPath(roundedRect: bar,
                          cornerWidth: 1.5, cornerHeight: 1.5,
                          transform: nil)
        context.addPath(path)
        context.fillPath()
        context.restoreGState()
    }
}
