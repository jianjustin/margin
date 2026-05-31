import Foundation

/// One visible row in the file tree.
struct RowDescriptor: Equatable, Identifiable {
    let url: URL
    let depth: Int
    let isFolder: Bool
    let isExpanded: Bool
    let isIgnored: Bool
    let childCount: Int

    var id: URL { url }
    var name: String {
        isFolder ? url.lastPathComponent
                 : url.deletingPathExtension().lastPathComponent
    }
    var fileExtension: String { url.pathExtension.lowercased() }
}

/// Pure transformation: walk the tree, skip the subtree of any collapsed
/// folder, and tag dotfile rows as ignored.
enum VaultTreeFlatten {
    static func flatten(nodes: [VaultNode],
                        expanded: Set<URL>,
                        depth: Int = 0) -> [RowDescriptor] {
        var out: [RowDescriptor] = []
        for node in nodes {
            switch node {
            case .folder(let url, let children):
                let isExp = expanded.contains(url)
                out.append(RowDescriptor(
                    url: url,
                    depth: depth,
                    isFolder: true,
                    isExpanded: isExp,
                    isIgnored: isDotName(url),
                    childCount: children.count
                ))
                if isExp {
                    out.append(contentsOf: flatten(nodes: children,
                                                   expanded: expanded,
                                                   depth: depth + 1))
                }
            case .note(let url):
                out.append(RowDescriptor(
                    url: url,
                    depth: depth,
                    isFolder: false,
                    isExpanded: false,
                    isIgnored: isDotName(url),
                    childCount: 0
                ))
            }
        }
        return out
    }

    private static func isDotName(_ url: URL) -> Bool {
        url.lastPathComponent.hasPrefix(".")
    }
}
