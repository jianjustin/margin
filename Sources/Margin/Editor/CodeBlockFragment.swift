import AppKit

/// Paints a rounded-corner background panel + 1pt border behind every
/// code-block layout fragment, then draws the text on top.
final class CodeBlockFragment: NSTextLayoutFragment {
    var fillColor: NSColor = NSColor(white: 0.15, alpha: 1)
    var borderColor: NSColor = NSColor(white: 0.3, alpha: 1)
    var horizontalInset: CGFloat = 4   // breathe a little beyond text
    var cornerRadius: CGFloat = 7

    override func draw(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let panel = CGRect(x: point.x + frame.minX - horizontalInset,
                           y: point.y + frame.minY,
                           width: frame.width + horizontalInset * 2,
                           height: frame.height)
        context.saveGState()
        // Background
        context.setFillColor(fillColor.cgColor)
        let bgPath = CGPath(roundedRect: panel,
                            cornerWidth: cornerRadius,
                            cornerHeight: cornerRadius,
                            transform: nil)
        context.addPath(bgPath)
        context.fillPath()
        // 1pt stroke
        context.setStrokeColor(borderColor.cgColor)
        context.setLineWidth(1)
        let strokePath = CGPath(roundedRect: panel.insetBy(dx: 0.5, dy: 0.5),
                                cornerWidth: cornerRadius,
                                cornerHeight: cornerRadius,
                                transform: nil)
        context.addPath(strokePath)
        context.strokePath()
        context.restoreGState()

        // Text on top.
        super.draw(at: point, in: context)
    }
}
