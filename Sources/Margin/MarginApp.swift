import SwiftUI
import AppKit

private struct WindowAccessor: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let v = NSView()
        DispatchQueue.main.async {
            if let win = v.window { onWindow(win) }
        }
        return v
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

@main
struct MarginApp: App {
    @StateObject private var state = AppState()
    @StateObject private var theme = ThemeStore()

    init() {
        FontStack.register()
    }

    var body: some Scene {
        // Empty WindowGroup title so neither the macOS title bar overlay
        // nor the Window menu surface the "Margin" string.
        WindowGroup("") {
            RootView()
                .environmentObject(state)
                .environmentObject(theme)
                .background(WindowAccessor { win in
                    win.setFrameAutosaveName("MarginMainWindow")
                    win.titlebarAppearsTransparent = true
                    win.titleVisibility = .hidden
                    win.styleMask.insert(.fullSizeContentView)
                    // Empty title so neither the titlebar overlay nor the
                    // app's Window menu shows the "Margin" label.
                    win.title = ""
                    // No system toolbar; the SwiftUI TitleBar paints this region.
                    win.toolbarStyle = .unified
                    // (isMovableByWindowBackground stays at its NSWindow default
                    //  of false; drag is provided by the system's titlebar
                    //  region, which sits behind the SwiftUI TitleBar.)
                })
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
            CommandGroup(after: .textEditing) {
                Button("Find in Notes…") {
                    state.searchSheetVisible = true
                }
                .keyboardShortcut("f", modifiers: [.command, .shift])
                .disabled(state.vaultRoot == nil)
            }
        }
    }
}
