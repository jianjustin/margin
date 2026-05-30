import SwiftUI

@main
struct MarginApp: App {
    var body: some Scene {
        WindowGroup("Margin") {
            Text("Margin – M1 skeleton")
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
    }
}
