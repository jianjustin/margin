import SwiftUI

struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(result.title)
                .font(.system(size: 15, weight: .medium))
            Text(result.snippet)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(relativePath)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 6)
    }

    private var relativePath: String {
        let parts = result.path.components(separatedBy: "/")
        return parts.suffix(3).joined(separator: "/")
    }
}
