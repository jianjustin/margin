import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Group {
            if state.vaultRoot == nil {
                NoVaultView(onChoose: { state.chooseVault() })
            } else {
                ThreePaneView()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
    }
}

struct ThreePaneView: View {
    @EnvironmentObject var state: AppState
    @State private var sidebarWidth: CGFloat = 240
    @State private var noteListWidth: CGFloat = 260

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: sidebarWidth, max: 360)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: noteListWidth, max: 400)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}

