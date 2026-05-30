import Foundation

struct VaultScanner {
    /// Synchronous scan. For large vaults, call from a background queue.
    /// - Returns: root-level children, folders first then notes, each alphabetical.
    func scan(root: URL) -> [VaultNode] {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [] // do NOT pass .skipsHiddenFiles — hidden dirs must remain visible
        ) else {
            return []
        }

        var folders: [VaultNode] = []
        var notes: [VaultNode] = []

        for url in entries {
            let resolved = try? url.resourceValues(forKeys: [.isDirectoryKey])
            let isDir = resolved?.isDirectory ?? false
            if isDir {
                let children = scan(root: url)
                folders.append(.folder(url: url, children: children))
            } else if url.pathExtension.lowercased() == "md" {
                notes.append(.note(url: url))
            }
        }

        folders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        notes.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return folders + notes
    }
}
