import Foundation
import GRDB

struct IndexedLink: Codable, FetchableRecord, PersistableRecord, Hashable {
    static let databaseTableName = "links"

    var src_path: String
    var dst_target: String
    var line: Int
    var context_snippet: String
}
