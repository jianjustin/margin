import Foundation

enum MarkdownLite {
    struct LinkRef: Hashable {
        var target: String
        var line: Int
        var contextSnippet: String
    }

    struct Result {
        var links: [LinkRef] = []
        var inlineTags: [String] = []
        var frontmatterTags: [String] = []
    }

    private static let wikiLinkRegex = try! NSRegularExpression(
        pattern: #"\[\[([^\[\]\n]+?)\]\]"#
    )
    private static let inlineTagRegex = try! NSRegularExpression(
        pattern: #"(?<![\w/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)"#
    )

    private static func splitFrontmatter(_ body: String) -> (front: String?, restStartLine: Int) {
        guard body.hasPrefix("---") else { return (nil, 1) }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return (nil, 1) }
        var i = 1
        while i < lines.count, lines[i] != "---" { i += 1 }
        if i < lines.count {
            let frontJoined = lines[1..<i].joined(separator: "\n")
            return (frontJoined, i + 2)
        }
        return (nil, 1)
    }

    static func extract(from body: String) -> Result {
        var result = Result()
        let (front, _) = splitFrontmatter(body)
        if let front {
            result.frontmatterTags = parseFrontmatterTags(front)
        }

        let stripped = maskCodeRegions(body)
        let lines = stripped.components(separatedBy: "\n")
        let originalLines = body.components(separatedBy: "\n")

        for (idx, line) in lines.enumerated() {
            let lineNumber = idx + 1
            let ns = line as NSString
            let range = NSRange(location: 0, length: ns.length)

            wikiLinkRegex.enumerateMatches(in: line, range: range) { match, _, _ in
                guard let m = match, m.numberOfRanges >= 2 else { return }
                let inner = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
                guard !inner.isEmpty else { return }
                let ctx = idx < originalLines.count ? originalLines[idx] : ""
                result.links.append(LinkRef(
                    target: inner,
                    line: lineNumber,
                    contextSnippet: String(ctx.prefix(200))
                ))
            }

            inlineTagRegex.enumerateMatches(in: line, range: range) { match, _, _ in
                guard let m = match, m.numberOfRanges >= 2 else { return }
                let tag = ns.substring(with: m.range(at: 1))
                result.inlineTags.append(tag)
            }
        }

        var seen = Set<String>()
        result.inlineTags = result.inlineTags.filter { seen.insert($0).inserted }

        return result
    }

    private static func maskCodeRegions(_ body: String) -> String {
        var out = ""
        var inFence = false
        for line in body.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") {
                inFence.toggle()
                out.append(String(repeating: " ", count: line.count))
                out.append("\n")
                continue
            }
            if inFence {
                out.append(String(repeating: " ", count: line.count))
                out.append("\n")
                continue
            }
            let masked = maskInlineCode(in: line)
            out.append(masked)
            out.append("\n")
        }
        if out.hasSuffix("\n") { out.removeLast() }
        return out
    }

    private static func maskInlineCode(in line: String) -> String {
        var result = ""
        var inCode = false
        for ch in line {
            if ch == "`" {
                inCode.toggle()
                result.append(" ")
            } else if inCode {
                result.append(" ")
            } else {
                result.append(ch)
            }
        }
        return result
    }

    private static func parseFrontmatterTags(_ block: String) -> [String] {
        let lines = block.components(separatedBy: "\n")
        guard let i = lines.firstIndex(where: { $0.hasPrefix("tags:") || $0.hasPrefix("tags ") }) else {
            return []
        }
        let header = lines[i]
        if let openBracket = header.firstIndex(of: "["),
           let closeBracket = header.firstIndex(of: "]"),
           openBracket < closeBracket {
            let inside = header[header.index(after: openBracket)..<closeBracket]
            return inside.split(separator: ",").map {
                $0.trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
            }.filter { !$0.isEmpty }
        }
        var result: [String] = []
        var j = i + 1
        while j < lines.count {
            let l = lines[j]
            if l.hasPrefix("  - ") || l.hasPrefix("- ") {
                let v = l.replacingOccurrences(of: "^\\s*-\\s+", with: "", options: .regularExpression)
                    .trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
                if !v.isEmpty { result.append(v) }
                j += 1
            } else {
                break
            }
        }
        return result
    }
}
