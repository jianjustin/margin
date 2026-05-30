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

// Placeholder for Task 8.
struct ThreePaneView: View {
    var body: some View {
        Text("ThreePaneView – filled in Task 8")
    }
}
