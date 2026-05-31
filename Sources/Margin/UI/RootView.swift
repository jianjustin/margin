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
                    TwoPaneView()
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

struct TwoPaneView: View {
    @EnvironmentObject var state: AppState
    @AppStorage(UserDefaultsKeys.sidebarWidth) private var sidebarWidth: Double = 244

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: CGFloat(sidebarWidth), max: 360)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}
