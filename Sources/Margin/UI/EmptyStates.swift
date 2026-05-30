import SwiftUI

struct NoVaultView: View {
    let onChoose: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Text("Welcome to Margin")
                .font(.largeTitle)
            Text("Choose a vault folder to begin.")
                .foregroundStyle(.secondary)
            Button("Choose Vault…", action: onChoose)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
        }
        .padding(40)
    }
}

struct NoNoteSelectedView: View {
    var body: some View {
        Text("Select a note")
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
