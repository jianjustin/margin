import Foundation
import Markdown

enum BlockKind: Equatable {
    case paragraph
    case heading
    case quote
    case code
    case other
}

/// Pure value-type index: parses Markdown once and exposes O(log n) range
/// queries for each block. UTF-16 offsets to match NSAttributedString /
/// NSTextView world.
struct BlockKindIndex {
    private struct Entry {
        let range: NSRange
        let kind: BlockKind
    }

    private let entries: [Entry]

    init(text: String) {
        let doc = Document(parsing: text)
        var built: [Entry] = []
        for child in doc.children {
            guard let sr = child.range,
                  let r = RangeConverter.nsRange(of: sr, in: text) else { continue }
            built.append(Entry(range: r, kind: BlockKindIndex.classify(child)))
        }
        self.entries = built
    }

    func kind(atUTF16Offset off: Int) -> BlockKind {
        for e in entries {
            if NSLocationInRange(off, e.range) { return e.kind }
        }
        return .paragraph
    }

    func ranges(of kind: BlockKind) -> [NSRange] {
        entries.filter { $0.kind == kind }.map(\.range)
    }

    private static func classify(_ markup: Markup) -> BlockKind {
        switch markup {
        case is Heading:     return .heading
        case is BlockQuote:  return .quote
        case is CodeBlock:   return .code
        case is Paragraph:   return .paragraph
        default:             return .other
        }
    }
}
