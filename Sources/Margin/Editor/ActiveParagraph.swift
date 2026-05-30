import Foundation

enum ActiveParagraph {
    /// Returns the NSRange of the paragraph containing `cursor` (UTF-16 offset).
    /// A paragraph is delimited by blank lines (lines whose trimmed content is empty)
    /// or by string boundaries.
    /// If the cursor is on a blank line, returns a zero-length range at the cursor.
    static func range(in text: String, cursor: Int) -> NSRange {
        let ns = text as NSString
        let length = ns.length
        let cursor = max(0, min(cursor, length))

        // Find the start of the current line.
        var lineStart = cursor
        while lineStart > 0 {
            let prev = ns.character(at: lineStart - 1)
            if prev == 0x0A { break }
            lineStart -= 1
        }

        // Find the end of the current line.
        var lineEnd = lineStart
        while lineEnd < length, ns.character(at: lineEnd) != 0x0A {
            lineEnd += 1
        }
        let currentLine = ns.substring(with: NSRange(location: lineStart, length: lineEnd - lineStart))
        if currentLine.trimmingCharacters(in: .whitespaces).isEmpty {
            return NSRange(location: cursor, length: 0)
        }

        // Expand up: previous non-blank lines.
        var paragraphStart = lineStart
        while paragraphStart > 0 {
            let prevLineEnd = paragraphStart - 1
            if prevLineEnd < 0 { break }
            // prevLineEnd is the index of '\n'; find its line start.
            var prevLineStart = prevLineEnd
            while prevLineStart > 0 {
                let prev = ns.character(at: prevLineStart - 1)
                if prev == 0x0A { break }
                prevLineStart -= 1
            }
            let prevLine = ns.substring(with: NSRange(location: prevLineStart,
                                                     length: prevLineEnd - prevLineStart))
            if prevLine.trimmingCharacters(in: .whitespaces).isEmpty {
                break
            }
            paragraphStart = prevLineStart
        }

        // Expand down: next non-blank lines.
        var paragraphEnd = lineEnd
        var i = lineEnd
        while i < length {
            if ns.character(at: i) == 0x0A {
                let nextLineStart = i + 1
                if nextLineStart >= length { break }
                var nextLineEnd = nextLineStart
                while nextLineEnd < length, ns.character(at: nextLineEnd) != 0x0A {
                    nextLineEnd += 1
                }
                let nextLine = ns.substring(with: NSRange(location: nextLineStart,
                                                         length: nextLineEnd - nextLineStart))
                if nextLine.trimmingCharacters(in: .whitespaces).isEmpty {
                    break
                }
                paragraphEnd = nextLineEnd
                i = nextLineEnd
            } else {
                break
            }
        }

        return NSRange(location: paragraphStart, length: paragraphEnd - paragraphStart)
    }
}
