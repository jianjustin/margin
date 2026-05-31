import AppKit

/// Paints a rounded-corner background panel + 1pt border behind every
/// code-block layout fragment, then draws the text on top.
final class CodeBlockFragment: NSTextLayoutFragment {
    var fillColor: NSColor = NSColor(white: 0.15, alpha: 1)
    var borderColor: NSColor = NSColor(white: 0.3, alpha: 1)
    var handleColor: NSColor = NSColor.gray
    var isHovered: Bool = false
    var horizontalInset: CGFloat = 4
    var cornerRadius: CGFloat = 7

    override func draw(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let panel = CGRect(x: point.x + frame.minX - horizontalInset,
                           y: point.y + frame.minY,
                           width: frame.width + horizontalInset * 2,
                           height: frame.height)
        context.saveGState()
        context.setFillColor(fillColor.cgColor)
        context.addPath(CGPath(roundedRect: panel,
                               cornerWidth: cornerRadius,
                               cornerHeight: cornerRadius,
                               transform: nil))
        context.fillPath()
        context.setStrokeColor(borderColor.cgColor)
        context.setLineWidth(1)
        context.addPath(CGPath(roundedRect: panel.insetBy(dx: 0.5, dy: 0.5),
                               cornerWidth: cornerRadius,
                               cornerHeight: cornerRadius,
                               transform: nil))
        context.strokePath()
        if isHovered {
            paintHandle(at: point, in: context)
        }
        context.restoreGState()

        // Text on top.
        super.draw(at: point, in: context)
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
