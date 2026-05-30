import SwiftUI

struct FileTreeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        List(selection: bindingForSelection()) {
            if let root = state.vaultRoot {
                Label("All", systemImage: "tray.full")
                    .tag(root as URL?)
            }
            ForEach(state.tree, id: \.id) { node in
                nodeView(node, depth: 0)
            }
        }
        .listStyle(.sidebar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    state.rescan()
                } label: { Image(systemName: "arrow.clockwise") }
                .help("Rescan vault")
            }
        }
    }

    private func nodeView(_ node: VaultNode, depth: Int) -> AnyView {
        switch node {
        case .folder(let url, let children):
            return AnyView(
                DisclosureGroup {
                    ForEach(children, id: \.id) { child in
                        nodeView(child, depth: depth + 1)
                    }
                } label: {
                    Label(url.lastPathComponent, systemImage: folderIcon(url))
                        .tag(url as URL?)
                }
            )
        case .note(let url):
            return AnyView(
                Label(url.deletingPathExtension().lastPathComponent, systemImage: "doc.text")
                    .tag(url as URL?)
            )
        }
    }

    private func folderIcon(_ url: URL) -> String {
        url.lastPathComponent.hasPrefix(".") ? "folder.badge.gearshape" : "folder"
    }

    private func bindingForSelection() -> Binding<URL?> {
        Binding(
            get: { state.selectedFolder ?? state.selectedNoteURL },
            set: { newValue in
                guard let url = newValue else {
                    state.selectedFolder = nil
                    return
                }
                let fm = FileManager.default
                var isDir: ObjCBool = false
                if fm.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                    state.selectFolder(url)
                } else {
                    state.openNote(url)
                }
            }
        )
    }
}
