import SwiftUI

struct FileTreeRow: View {
    let row: RowDescriptor
    let isSelected: Bool
    let isHovered: Bool
    let onToggleExpand: () -> Void
    let onTap: () -> Void

    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 6) {
            // Indent + chevron
            Color.clear.frame(width: CGFloat(row.depth) * 16)
            chevron
            icon
            Text(row.name)
                .font(.system(size: 13,
                              weight: row.isFolder ? .semibold : .regular))
                .foregroundStyle(Color(theme.palette.text))
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 4)
            if row.isFolder, row.childCount > 0 {
                Text("\(row.childCount)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Color(theme.palette.textFaint))
                    .padding(.horizontal, 6)
                    .frame(height: 16)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(theme.palette.bg))
                    )
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 24)
        .background(rowBackground)
        .overlay(rowBorder)
        .contentShape(Rectangle())
        .opacity(row.isIgnored ? 0.42 : 1.0)
        .onTapGesture(perform: onTap)
    }

    @ViewBuilder
    private var chevron: some View {
        if row.isFolder {
            Button(action: onToggleExpand) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Color(theme.palette.textFaint))
                    .rotationEffect(.degrees(row.isExpanded ? 90 : 0))
                    .animation(.easeInOut(duration: 0.12), value: row.isExpanded)
                    .frame(width: 12, height: 12)
            }
            .buttonStyle(.plain)
        } else {
            Color.clear.frame(width: 12, height: 12)
        }
    }

    @ViewBuilder
    private var icon: some View {
        Image(systemName: iconSystemName)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Color(iconColor))
            .frame(width: 17, height: 17)
    }

    private var iconSystemName: String {
        if row.isFolder { return "folder.fill" }
        switch row.fileExtension {
        case "md": return "doc.text"
        case "canvas": return "square.grid.2x2"
        case "json": return "curlybraces"
        default: return "doc"
        }
    }

    private var iconColor: NSColor {
        if row.isFolder { return theme.palette.accent }
        switch row.fileExtension {
        case "md": return theme.palette.accent
        case "canvas": return theme.palette.canvasBlue
        case "json": return theme.palette.textFaint
        default: return theme.palette.textFaint
        }
    }

    @ViewBuilder
    private var rowBackground: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 6).fill(Color(theme.palette.accentSoft))
        } else if isHovered {
            RoundedRectangle(cornerRadius: 6).fill(Color(theme.palette.bgHover))
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private var rowBorder: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color(theme.palette.accentLine), lineWidth: 1)
        }
    }
}
