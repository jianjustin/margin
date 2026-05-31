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
        // .hiddenTitleBar removes the entire native title-bar / toolbar
        // region (including the auto-rendered NavigationSplitView toolbar
        // items) while keeping the traffic-light cluster. The custom
        // SwiftUI TitleBar at the top of RootView now paints from y=0.
        .windowStyle(.hiddenTitleBar)
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
            CommandGroup(after: .sidebar) {
                // Native toolbar's rescan button vanished with .hiddenTitleBar;
                // surface the action via Cmd-R + View menu.
                Button("Rescan Vault") { state.rescan() }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(state.vaultRoot == nil)
            }
        }
    }
}
