import Foundation
import CoreServices

/// Recursive FSEvents watcher with debounced batch callback.
final class FileWatcher: @unchecked Sendable {
    typealias Callback = ([URL]) -> Void

    private let root: URL
    private let debounceMillis: Int
    private let callback: Callback

    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "Margin.FileWatcher")
    private var pendingPaths: Set<String> = []
    private var debounceWorkItem: DispatchWorkItem?

    init(root: URL, debounceMillis: Int = 500, callback: @escaping Callback) {
        self.root = root
        self.debounceMillis = debounceMillis
        self.callback = callback
    }

    func start() {
        let paths = [root.path] as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        let callback: FSEventStreamCallback = { _, contextInfo, numEvents, eventPaths, _, _ in
            guard let contextInfo else { return }
            let watcher = Unmanaged<FileWatcher>.fromOpaque(contextInfo).takeUnretainedValue()
            let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as! [String]
            watcher.enqueue(paths: paths)
        }
        guard let stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            callback,
            &context,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            0.2,
            FSEventStreamCreateFlags(
                kFSEventStreamCreateFlagFileEvents |
                kFSEventStreamCreateFlagNoDefer |
                kFSEventStreamCreateFlagUseCFTypes
            )
        ) else { return }

        FSEventStreamSetDispatchQueue(stream, queue)
        FSEventStreamStart(stream)
        self.stream = stream
    }

    func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    deinit { stop() }

    private func enqueue(paths: [String]) {
        queue.async { [weak self] in
            guard let self else { return }
            for p in paths { self.pendingPaths.insert(p) }
            self.debounceWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                let urls = self.pendingPaths.map { URL(fileURLWithPath: $0) }
                self.pendingPaths.removeAll()
                self.callback(urls)
            }
            self.debounceWorkItem = work
            self.queue.asyncAfter(deadline: .now() + .milliseconds(self.debounceMillis), execute: work)
        }
    }
}
