import SwiftUI

struct SearchSheet: View {
    @EnvironmentObject var state: AppState
    @State private var query: String = ""
    @State private var results: [SearchResult] = []
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search notes…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18))
                    .onSubmit { runSearch(query) }
                    .onChange(of: query) { _, newValue in
                        debounceSearch(newValue)
                    }
                Button("Close") { state.searchSheetVisible = false }
                    .keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()
            if results.isEmpty && !query.isEmpty {
                Text("No results")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(results) { result in
                    SearchResultRow(result: result)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            open(result)
                        }
                }
                .listStyle(.plain)
            }
        }
        .frame(width: 720, height: 480)
    }

    private func debounceSearch(_ value: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { runSearch(value) }
        }
    }

    private func runSearch(_ q: String) {
        guard let service = state.searchService else { return }
        Task {
            let hits = (try? await service.query(q)) ?? []
            await MainActor.run { self.results = hits }
        }
    }

    private func open(_ result: SearchResult) {
        let url = URL(fileURLWithPath: result.path)
        state.openNote(url)
        state.searchSheetVisible = false
    }
}
