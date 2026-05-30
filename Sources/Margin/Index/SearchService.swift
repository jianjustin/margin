import Foundation
import GRDB

struct SearchResult: Identifiable, Hashable, Sendable {
    var path: String
    var title: String
    var snippet: String
    var id: String { path }
}

actor SearchService {
    private let store: IndexStore

    init(store: IndexStore) {
        self.store = store
    }

    /// FTS5 query. Empty/whitespace input → empty result.
    /// Title hits boosted via `bm25(fts_notes, 10.0, 1.0)`.
    func query(_ raw: String) async throws -> [SearchResult] {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }

        let ftsQuery = sanitizeForFTS5(trimmed)
        return try await store.queue.read { db -> [SearchResult] in
            let rows = try Row.fetchAll(db, sql: """
                SELECT path, title,
                       snippet(fts_notes, 2, '«', '»', '…', 16) AS snippet
                FROM fts_notes
                WHERE fts_notes MATCH ?
                ORDER BY bm25(fts_notes, 0.0, 50.0, 1.0)
                LIMIT 100
            """, arguments: [ftsQuery])
            return rows.map { row in
                SearchResult(
                    path: row["path"],
                    title: row["title"],
                    snippet: row["snippet"]
                )
            }
        }
    }

    /// FTS5 query sanitization: each whitespace-split token becomes a prefix term ANDed.
    private func sanitizeForFTS5(_ input: String) -> String {
        let tokens = input
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .map { token -> String in
                let escaped = token.replacingOccurrences(of: "\"", with: "\"\"")
                return "\"\(escaped)\"*"
            }
        return tokens.joined(separator: " AND ")
    }
}
