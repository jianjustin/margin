import Foundation
import GRDB

actor Indexer {
    private let store: IndexStore

    init(store: IndexStore) {
        self.store = store
    }

    /// Re-scan the entire vault and reconcile DB with disk.
    func fullScan(vaultRoot: URL) async throws {
        let fileURLs = collectMarkdownURLs(under: vaultRoot)
        let onDiskPaths = Set(fileURLs.map { $0.resolvingSymlinksInPath().path })

        try await store.queue.write { db in
            // Wipe stale rows for files that disappeared.
            let existing = try String.fetchAll(db, sql: "SELECT path FROM notes")
            let toDelete = existing.filter { !onDiskPaths.contains($0) }
            for path in toDelete {
                try db.execute(sql: "DELETE FROM notes WHERE path = ?", arguments: [path])
                try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
            }

            // Upsert each on-disk file.
            for url in fileURLs {
                try Self.upsert(file: url, db: db)
            }
        }
    }

    /// Reconcile a single file (delete if gone, else upsert).
    func updateFile(_ url: URL, vaultRoot: URL) async throws {
        let path = url.resolvingSymlinksInPath().path
        if !FileManager.default.fileExists(atPath: path) {
            try await store.queue.write { db in
                try db.execute(sql: "DELETE FROM notes WHERE path = ?", arguments: [path])
                try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
            }
            return
        }
        try await store.queue.write { db in
            try Self.upsert(file: url, db: db)
        }
    }

    // MARK: - Internals

    nonisolated private func collectMarkdownURLs(under root: URL) -> [URL] {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: root,
                                             includingPropertiesForKeys: [.isRegularFileKey],
                                             options: []) else { return [] }
        var out: [URL] = []
        for case let u as URL in enumerator {
            if u.pathExtension.lowercased() == "md" {
                out.append(u)
            }
        }
        return out
    }

    private static func upsert(file url: URL, db: Database) throws {
        let path = url.resolvingSymlinksInPath().path
        guard let body = try? String(contentsOf: url, encoding: .utf8) else { return }
        let attrs = (try? FileManager.default.attributesOfItem(atPath: path)) ?? [:]
        let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        let size = (attrs[.size] as? Int) ?? body.utf8.count

        let title = resolveTitle(body: body, url: url)
        let frontmatterJSON = encodeFrontmatter(body: body)

        try db.execute(sql: """
            INSERT INTO notes(path, title, mtime, size, frontmatter_json)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                mtime = excluded.mtime,
                size  = excluded.size,
                frontmatter_json = excluded.frontmatter_json
        """, arguments: [path, title, mtime, size, frontmatterJSON])

        try db.execute(sql: "DELETE FROM links WHERE src_path = ?", arguments: [path])
        try db.execute(sql: "DELETE FROM tags WHERE path = ?", arguments: [path])
        let extracted = MarkdownLite.extract(from: body)
        for link in extracted.links {
            try db.execute(sql: """
                INSERT INTO links(src_path, dst_target, line, context_snippet)
                VALUES(?, ?, ?, ?)
            """, arguments: [path, link.target, link.line, link.contextSnippet])
        }
        for tag in extracted.frontmatterTags {
            try db.execute(sql: """
                INSERT OR IGNORE INTO tags(path, tag, source) VALUES(?, ?, 'frontmatter')
            """, arguments: [path, tag])
        }
        for tag in extracted.inlineTags {
            try db.execute(sql: """
                INSERT OR IGNORE INTO tags(path, tag, source) VALUES(?, ?, 'inline')
            """, arguments: [path, tag])
        }

        try db.execute(sql: "DELETE FROM fts_notes WHERE path = ?", arguments: [path])
        try db.execute(sql: """
            INSERT INTO fts_notes(path, title, body) VALUES(?, ?, ?)
        """, arguments: [path, title, body])
    }

    private static func resolveTitle(body: String, url: URL) -> String {
        if body.hasPrefix("---") {
            let lines = body.components(separatedBy: "\n")
            var i = 1
            while i < lines.count, lines[i] != "---" {
                let l = lines[i]
                if let range = l.range(of: #"^\s*title\s*:\s*"#, options: .regularExpression) {
                    var v = String(l[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                    if v.hasPrefix("\""), v.hasSuffix("\""), v.count >= 2 {
                        v = String(v.dropFirst().dropLast())
                    }
                    if !v.isEmpty { return v }
                }
                i += 1
            }
        }
        for line in body.components(separatedBy: "\n") {
            if line.hasPrefix("# ") {
                return String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            }
        }
        return url.deletingPathExtension().lastPathComponent
    }

    private static func encodeFrontmatter(body: String) -> String? {
        guard body.hasPrefix("---") else { return nil }
        let lines = body.components(separatedBy: "\n")
        guard lines.first == "---" else { return nil }
        var dict: [String: String] = [:]
        var i = 1
        while i < lines.count, lines[i] != "---" {
            let l = lines[i]
            if let colon = l.firstIndex(of: ":") {
                let key = String(l[..<colon]).trimmingCharacters(in: .whitespaces)
                let value = String(l[l.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                if !key.isEmpty && !value.isEmpty && !value.hasPrefix("[") && !value.hasPrefix("-") {
                    dict[key] = value
                }
            }
            i += 1
        }
        if dict.isEmpty { return nil }
        return (try? JSONSerialization.data(withJSONObject: dict))
            .flatMap { String(data: $0, encoding: .utf8) }
    }
}
