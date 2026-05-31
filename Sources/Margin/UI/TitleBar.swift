import SwiftUI

/// 38pt high chrome that replaces the system title bar. The window is
/// configured with `titlebarAppearsTransparent + fullSizeContentView`
/// (see MarginApp.swift), so this view paints behind the native traffic
/// lights. The leading 70pt is reserved for those buttons.
struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 0) {
            // Reserved gutter for the macOS traffic-light buttons.
            Color.clear.frame(width: 70)
            Spacer(minLength: 0)
            // Center + right slots arrive in Tasks 3-4.
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
