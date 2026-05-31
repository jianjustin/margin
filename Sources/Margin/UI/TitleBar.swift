import SwiftUI

struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                Color.clear.frame(width: 70)
                Spacer(minLength: 0)
                ToolbarButtons()
                    .environmentObject(theme)
                    .padding(.trailing, 10)
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
        .frame(maxWidth: 420)
    }

    private func parentFolderName(for url: URL) -> String? {
        let parent = url.deletingLastPathComponent()
        let name = parent.lastPathComponent
        return name.isEmpty ? nil : name
    }
}

private struct ToolbarButtons: View {
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 2) {
            TBButton(systemName: "sidebar.left",
                     help: "切换笔记列表 (⌘B)",
                     enabled: false,
                     action: {})
            TBButton(systemName: theme.mode == .dark ? "sun.max" : "moon",
                     help: "切换主题",
                     enabled: true,
                     action: { theme.toggleMode() })
            TBButton(systemName: "gearshape",
                     help: "设置 (⌘,)",
                     enabled: false,
                     action: {})
            TBButton(systemName: "rectangle.grid.2x2",
                     help: "块库 (⌘\\)",
                     enabled: false,
                     action: {})
        }
    }
}

private struct TBButton: View {
    let systemName: String
    let help: String
    let enabled: Bool
    let action: () -> Void
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Color(enabled ? theme.palette.textDim : theme.palette.textFaint))
                .frame(width: 30, height: 26)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.clear)
                )
                .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .help(help)
    }
}
