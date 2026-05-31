import SwiftUI

struct FileTreeView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore
    @State private var expandedURLs: Set<URL> = []
    @State private var hoveredURL: URL? = nil

    private var rows: [RowDescriptor] {
        VaultTreeFlatten.flatten(nodes: state.tree, expanded: expandedURLs)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 1) {
                ForEach(rows) { row in
                    FileTreeRow(
                        row: row,
                        isSelected: isSelected(row),
                        isHovered: hoveredURL == row.url,
                        onToggleExpand: { toggleExpand(row.url) },
                        onTap: { handleTap(row) }
                    )
                    .environmentObject(theme)
                    .onHover { hovering in
                        if hovering { hoveredURL = row.url }
                        else if hoveredURL == row.url { hoveredURL = nil }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
        .background(Color(theme.palette.bgPanel))
        // The native NavigationSplitView toolbar is suppressed by
        // .windowStyle(.hiddenTitleBar) in MarginApp; rescan is exposed
        // via the Cmd-R menu command instead.
    }

    private func isSelected(_ row: RowDescriptor) -> Bool {
        if row.isFolder {
            return state.selectedFolder == row.url
        } else {
            return state.selectedNoteURL == row.url
        }
    }

    private func toggleExpand(_ url: URL) {
        if expandedURLs.contains(url) { expandedURLs.remove(url) }
        else { expandedURLs.insert(url) }
    }

    private func handleTap(_ row: RowDescriptor) {
        if row.isFolder {
            // Tapping a folder both selects it and toggles its expansion.
            state.selectFolder(row.url)
            toggleExpand(row.url)
        } else {
            state.openNote(row.url)
        }
    }
}
