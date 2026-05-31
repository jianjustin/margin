import AppKit

/// NSTextLayoutManagerDelegate that returns a chrome-aware fragment subclass
/// (Quote / Code / default) based on the latest BlockKindIndex.
final class BlockChromeDelegate: NSObject, NSTextLayoutManagerDelegate {

    var index: BlockKindIndex = BlockKindIndex(text: "")
    var palette: Palette = Palette.dark(accent: .warmGold)
    weak var contentStorage: NSTextContentStorage?

    func textLayoutManager(_ textLayoutManager: NSTextLayoutManager,
                           textLayoutFragmentFor location: any NSTextLocation,
                           in textElement: NSTextElement) -> NSTextLayoutFragment {
        let kind = kindAt(location, manager: textLayoutManager)
        switch kind {
        case .quote:
            let frag = QuoteBlockFragment(textElement: textElement,
                                          range: textElement.elementRange)
            frag.barColor = palette.accent
            return frag
        default:
            return NSTextLayoutFragment(textElement: textElement,
                                        range: textElement.elementRange)
        }
    }

    private func kindAt(_ location: any NSTextLocation,
                        manager: NSTextLayoutManager) -> BlockKind {
        guard let storage = contentStorage else {
            return .paragraph
        }
        let start = manager.documentRange.location
        let offset = storage.offset(from: start, to: location)
        return index.kind(atUTF16Offset: max(0, offset))
    }
}
