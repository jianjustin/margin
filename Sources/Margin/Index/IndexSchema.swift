import Foundation
import GRDB

enum IndexSchema {
    static func register(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v1-initial") { db in
            try db.create(table: "notes") { t in
                t.primaryKey("path", .text)
                t.column("title", .text).notNull()
                t.column("mtime", .double).notNull()
                t.column("size", .integer).notNull()
                t.column("frontmatter_json", .text)
            }

            try db.create(table: "links") { t in
                t.column("src_path", .text).notNull()
                  .references("notes", onDelete: .cascade)
                t.column("dst_target", .text).notNull()
                t.column("line", .integer).notNull()
                t.column("context_snippet", .text).notNull()
            }
            try db.create(index: "idx_links_src", on: "links", columns: ["src_path"])
            try db.create(index: "idx_links_dst", on: "links", columns: ["dst_target"])

            try db.create(table: "tags") { t in
                t.column("path", .text).notNull()
                  .references("notes", onDelete: .cascade)
                t.column("tag", .text).notNull()
                t.column("source", .text).notNull()
                t.primaryKey(["path", "tag", "source"])
            }
            try db.create(index: "idx_tags_tag", on: "tags", columns: ["tag"])

            try db.execute(sql: """
                CREATE VIRTUAL TABLE fts_notes USING fts5(
                    path UNINDEXED,
                    title,
                    body,
                    tokenize = 'unicode61 remove_diacritics 2'
                )
            """)
        }
    }
}
