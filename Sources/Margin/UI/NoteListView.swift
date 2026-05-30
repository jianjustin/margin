import SwiftUI

struct NoteListView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        let urls = state.notesInSelectedFolder()
        List(urls, id: \.self, selection: selectionBinding) { url in
            NoteRow(url: url)
                .tag(url)
        }
        .listStyle(.inset)
        .overlay {
            if urls.isEmpty {
                Text("No notes in this folder")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var selectionBinding: Binding<URL?> {
        Binding(
            get: { state.selectedNoteURL },
            set: { newValue in
                if let url = newValue { state.openNote(url) }
            }
        )
    }
}

private struct NoteRow: View {
    let url: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(url.deletingPathExtension().lastPathComponent)
                .font(.system(size: 14, weight: .medium))
                .lineLimit(1)
            Text(preview)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(mtimeString)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        let body = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        let stripped = body
            .split(separator: "\n")
            .drop(while: { $0.hasPrefix("---") || $0.hasPrefix("title:") || $0.hasPrefix("tags:") || $0.hasPrefix("created:") })
            .joined(separator: " ")
        return String(stripped.prefix(120))
    }

    private var mtimeString: String {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let date = (attrs?[.modificationDate] as? Date) ?? .distantPast
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }
}
