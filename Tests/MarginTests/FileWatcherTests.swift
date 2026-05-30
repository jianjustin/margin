import XCTest
@testable import Margin

final class FileWatcherTests: XCTestCase {
    var watchDir: URL!

    override func setUpWithError() throws {
        watchDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-watcher-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: watchDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: watchDir)
    }

    func testFiresCallbackOnNewFile() throws {
        let expectation = XCTestExpectation(description: "fires for new file")
        let watcher = FileWatcher(root: watchDir, debounceMillis: 100) { _ in
            expectation.fulfill()
        }
        watcher.start()
        defer { watcher.stop() }

        Thread.sleep(forTimeInterval: 0.3)

        let f = watchDir.appendingPathComponent("hello.md")
        try "x".write(to: f, atomically: true, encoding: .utf8)

        wait(for: [expectation], timeout: 3.0)
    }

    func testCoalescesBurstWritesViaDebounce() throws {
        let invocations = NSCountedSet()
        let lock = NSLock()
        let expectation = XCTestExpectation(description: "debounced")
        let watcher = FileWatcher(root: watchDir, debounceMillis: 300) { _ in
            lock.lock(); invocations.add("hit"); lock.unlock()
            expectation.fulfill()
        }
        watcher.start()
        defer { watcher.stop() }
        Thread.sleep(forTimeInterval: 0.3)

        for i in 0..<10 {
            try "x\(i)".write(to: watchDir.appendingPathComponent("burst-\(i).md"),
                              atomically: true, encoding: .utf8)
        }
        wait(for: [expectation], timeout: 3.0)
        Thread.sleep(forTimeInterval: 0.6)
        XCTAssertLessThan(invocations.count(for: "hit"), 10,
                          "debounce should coalesce 10 writes into <10 callbacks")
    }
}
