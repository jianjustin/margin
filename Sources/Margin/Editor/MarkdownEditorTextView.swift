import AppKit

/// NSTextView subclass that emits hover events to a closure.
/// One NSTrackingArea, replaced on every bounds change.
final class MarkdownEditorTextView: NSTextView {

    /// Called on every mouseMoved with the event's local point in
    /// text-container coordinates. The handler is responsible for
    /// fragment lookup and redraw invalidation.
    var onHoverPoint: ((CGPoint) -> Void)?
    var onHoverExit: (() -> Void)?

    private var trackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = trackingArea { removeTrackingArea(existing) }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.activeInActiveApp, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        let p = convert(event.locationInWindow, from: nil)
        let inText = CGPoint(x: p.x - textContainerInset.width,
                             y: p.y - textContainerInset.height)
        onHoverPoint?(inText)
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        onHoverExit?()
    }
}
