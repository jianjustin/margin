import Foundation
import GRDB

final class IndexStore {
    let queue: DatabaseQueue

    init(databaseURL: URL) throws {
        var config = Configuration()
        config.label = "Margin.IndexStore"
        config.foreignKeysEnabled = true
        self.queue = try DatabaseQueue(path: databaseURL.path, configuration: config)

        var migrator = DatabaseMigrator()
        IndexSchema.register(in: &migrator)
        try migrator.migrate(self.queue)
    }
}
