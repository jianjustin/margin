import Foundation
import Markdown

/// Aggregated counters shown in the status bar.
struct Stats: Equatable {
    var chars: Int = 0
    var words: Int = 0
    var minutes: Int = 1
    var blocks: Int = 0

    static let empty = Stats()
}

/// Pure stat computation. The debounced tracker that publishes Stats lives
/// in StatsTracker (added in Task 6).
enum StatsCalculator {

    /// Reading speed used to derive the minutes value. Matches the design
    /// mockup's `editor.js#stats` formula (320 cjk-chars/words per minute).
    static let wordsPerMinute = 320

    private static let cjkRegex = try! NSRegularExpression(
        pattern: "[\u{4E00}-\u{9FFF}\u{3040}-\u{30FF}\u{AC00}-\u{D7AF}]"
    )
    private static let wordRegex = try! NSRegularExpression(
        pattern: "[A-Za-z0-9]+(?:['\u{2019}-][A-Za-z0-9]+)*"
    )

    static func compute(_ text: String) -> Stats {
        let ns = text as NSString
        let range = NSRange(location: 0, length: ns.length)

        // chars: non-whitespace UTF-16 length
        var nonWS = 0
        text.unicodeScalars.forEach { sc in
            if !CharacterSet.whitespacesAndNewlines.contains(sc) { nonWS += 1 }
        }

        let cjk = cjkRegex.numberOfMatches(in: text, range: range)
        let eng = wordRegex.numberOfMatches(in: text, range: range)
        let total = cjk + eng

        let minutes = max(1, Int((Double(total) / Double(wordsPerMinute)).rounded()))

        let blocks: Int = {
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return 0 }
            let doc = Document(parsing: text)
            return doc.children.reduce(0) { acc, _ in acc + 1 }
        }()

        return Stats(chars: nonWS, words: total, minutes: minutes, blocks: blocks)
    }
}

/// Debounced observable that recomputes Stats from a stream of text updates.
/// Drop the latest text in via `schedule(_:)`; after the debounce window
/// expires it computes Stats off the main actor and publishes the result.
@MainActor
final class StatsTracker: ObservableObject {
    @Published private(set) var stats: Stats = .empty

    private let debounce: DispatchTimeInterval
    private var pendingTask: Task<Void, Never>?

    init(debounce: DispatchTimeInterval = .milliseconds(200)) {
        self.debounce = debounce
    }

    func schedule(_ text: String) {
        pendingTask?.cancel()
        pendingTask = Task { [weak self, debounce] in
            guard let nanos = debounce.nanoseconds else { return }
            try? await Task.sleep(nanoseconds: nanos)
            if Task.isCancelled { return }
            let computed = await Task.detached(priority: .utility) {
                StatsCalculator.compute(text)
            }.value
            if Task.isCancelled { return }
            self?.stats = computed
        }
    }
}

private extension DispatchTimeInterval {
    var nanoseconds: UInt64? {
        switch self {
        case .seconds(let s): return UInt64(s) * 1_000_000_000
        case .milliseconds(let ms): return UInt64(ms) * 1_000_000
        case .microseconds(let us): return UInt64(us) * 1_000
        case .nanoseconds(let ns): return UInt64(ns)
        default: return nil
        }
    }
}
