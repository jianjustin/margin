import SwiftUI

@main
struct MarginApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup("Margin") {
            RootView()
                .environmentObject(state)
                .task { state.loadStoredVault() }
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Choose Vault…") { state.chooseVault() }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save") { state.saveCurrent() }
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(state.selectedNoteURL == nil)
            }
        }
    }
}
