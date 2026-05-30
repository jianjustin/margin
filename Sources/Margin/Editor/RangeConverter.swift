import Foundation
import Markdown

enum RangeConverter {
    /// Maps a swift-markdown SourceRange (1-indexed line/column over Unicode scalars)
    /// to an NSRange measured in UTF-16 code units of `text`.
    /// Returns nil if the source line is out of bounds.
    static func nsRange(of range: SourceRange, in text: String) -> NSRange? {
        guard let start = utf16Offset(line: range.lowerBound.line,
                                      column: range.lowerBound.column,
                                      in: text) else { return nil }
        guard let end = utf16Offset(line: range.upperBound.line,
                                    column: range.upperBound.column,
                                    in: text) else { return nil }
        let length = max(0, end - start)
        return NSRange(location: start, length: length)
    }

    /// Returns the UTF-16 offset of (line, column) — both 1-indexed.
    private static func utf16Offset(line: Int, column: Int, in text: String) -> Int? {
        guard line >= 1, column >= 1 else { return nil }
        var currentLine = 1
        var idx = text.startIndex
        while currentLine < line, idx < text.endIndex {
            if text[idx] == "\n" {
                currentLine += 1
            }
            idx = text.index(after: idx)
        }
        if currentLine < line {
            // Permit "one past the end" — line=lastLine+1, col=1.
            if currentLine == line - 1 && column == 1 && idx == text.endIndex {
                let utf16Index = idx.samePosition(in: text.utf16) ?? text.utf16.endIndex
                return text.utf16.distance(from: text.utf16.startIndex, to: utf16Index)
            }
            return nil
        }
        var col = 1
        while col < column, idx < text.endIndex, text[idx] != "\n" {
            idx = text.index(after: idx)
            col += 1
        }
        let utf16Index = idx.samePosition(in: text.utf16) ?? text.utf16.endIndex
        return text.utf16.distance(from: text.utf16.startIndex, to: utf16Index)
    }
}
