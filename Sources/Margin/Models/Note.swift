import Foundation

struct Note: Identifiable, Hashable {
    let url: URL
    let body: String

    var id: URL { url }
    var filename: String { url.deletingPathExtension().lastPathComponent }

    var title: String {
        if let fm = frontmatterTitle { return fm }
        if let h1 = firstH1 { return h1 }
        return filename
    }

    private var frontmatterTitle: String? {
        guard body.hasPrefix("---") else { return nil }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return nil }
        var i = 1
        while i < lines.count, lines[i] != "---" {
            let line = lines[i]
            if let range = line.range(of: #"^\s*title\s*:\s*"#, options: .regularExpression) {
                var value = String(line[range.upperBound...])
                value = value.trimmingCharacters(in: .whitespaces)
                if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
                    value = String(value.dropFirst().dropLast())
                }
                return value.isEmpty ? nil : value
            }
            i += 1
        }
        return nil
    }

    private var firstH1: String? {
        for line in body.components(separatedBy: "\n") {
            if line.hasPrefix("# ") {
                return String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            }
            if line.hasPrefix("---") { continue }
        }
        return nil
    }
}
