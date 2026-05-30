import Foundation

enum VaultNode: Identifiable, Hashable {
    case folder(url: URL, children: [VaultNode])
    case note(url: URL)

    var id: URL { url }

    var url: URL {
        switch self {
        case .folder(let u, _), .note(let u): return u
        }
    }

    var name: String { url.lastPathComponent }

    var isFolder: Bool {
        if case .folder = self { return true }
        return false
    }

    var children: [VaultNode]? {
        if case .folder(_, let c) = self { return c }
        return nil
    }
}
