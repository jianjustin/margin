import SwiftUI

/// 38pt high chrome that replaces the system title bar. The window is
/// configured with `titlebarAppearsTransparent + fullSizeContentView`
/// (see MarginApp.swift), so this view paints behind the native traffic
/// lights. The leading 70pt is reserved for those buttons.
struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                Color.clear.frame(width: 70)   // traffic lights gutter
                Spacer(minLength: 0)
                // Right-side button slot is added in Task 4.
            }
            BreadcrumbCenter()
                .environmentObject(state)
                .environmentObject(theme)
        }
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .bottom
        )
    }
}

private struct BreadcrumbCenter: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 8) {
            if let url = state.selectedNoteURL {
                if let parent = parentFolderName(for: url) {
                    Text(parent)
                        .foregroundStyle(Color(theme.palette.textFaint))
                    Text("/")
                        .foregroundStyle(Color(theme.palette.textFaint))
                }
                Text(url.deletingPathExtension().lastPathComponent)
                    .foregroundStyle(Color(theme.palette.textDim))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Circle()
                    .fill(Color(theme.palette.accent))
                    .frame(width: 6, height: 6)
                    .opacity(state.dirty ? 1 : 0)
                    .animation(.easeInOut(duration: 0.2), value: state.dirty)
                    .help("Unsaved changes")
            }
        }
        .font(.system(size: 12.5, weight: .medium))
        // Cap width so a long filename truncates instead of pushing the
        // right-side button slot off-screen.
        .frame(maxWidth: 420)
    }

    private func parentFolderName(for url: URL) -> String? {
        let parent = url.deletingLastPathComponent()
        let name = parent.lastPathComponent
        return name.isEmpty ? nil : name
    }
}
