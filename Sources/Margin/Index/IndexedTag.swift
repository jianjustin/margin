import Foundation
import GRDB

struct IndexedTag: Codable, FetchableRecord, PersistableRecord, Hashable {
    enum Source: String, Codable {
        case frontmatter
        case inline
    }

    static let databaseTableName = "tags"

    var path: String
    var tag: String
    var source: String
}
