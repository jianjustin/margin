import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        VStack(spacing: 0) {
            TitleBar()
            Group {
                if state.vaultRoot == nil {
                    NoVaultView(onChoose: { state.chooseVault() })
                } else {
                    ThreePaneView()
                }
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .preferredColorScheme(theme.mode == .dark ? .dark : .light)
        .sheet(isPresented: $state.searchSheetVisible) {
            SearchSheet()
                .environmentObject(state)
                .environmentObject(theme)
        }
    }
}

struct ThreePaneView: View {
    @EnvironmentObject var state: AppState
    @AppStorage(UserDefaultsKeys.sidebarWidth) private var sidebarWidth: Double = 240
    @AppStorage(UserDefaultsKeys.noteListWidth) private var noteListWidth: Double = 260

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: CGFloat(sidebarWidth), max: 360)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: CGFloat(noteListWidth), max: 400)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}

