import Foundation
import GRDB

struct IndexedNote: Codable, FetchableRecord, PersistableRecord, Hashable {
    static let databaseTableName = "notes"

    var path: String
    var title: String
    var mtime: Double
    var size: Int
    var frontmatter_json: String?
}
