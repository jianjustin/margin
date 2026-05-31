import SwiftUI

/// 28pt bottom strip living inside the editor pane.
/// Reads counters from a StatsTracker and the save state from AppState.
struct StatusBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore
    @ObservedObject var tracker: StatsTracker

    var body: some View {
        HStack(spacing: 16) {
            segment("\(tracker.stats.chars) 字符")
            segment("\(tracker.stats.words) 词")
            segment("约 \(tracker.stats.minutes) 分钟")
            Spacer()
            segment("\(tracker.stats.blocks) 块")
            Text(state.dirty ? "保存中…" : "已同步")
                .foregroundStyle(Color(theme.palette.accent))
        }
        .font(.system(size: 11.5))
        .foregroundStyle(Color(theme.palette.textFaint))
        .padding(.horizontal, 16)
        .frame(height: 28)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .top
        )
    }

    @ViewBuilder
    private func segment(_ text: String) -> some View {
        Text(text)
    }
}
