import XCTest
@testable import Margin

final class FileIOTests: XCTestCase {
    var tempFile: URL!

    override func setUpWithError() throws {
        tempFile = FileManager.default.temporaryDirectory
            .appendingPathComponent("margin-iotest-\(UUID().uuidString).md")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempFile)
    }

    func testReadReturnsContent() throws {
        try "hello\nworld".write(to: tempFile, atomically: true, encoding: .utf8)
        XCTAssertEqual(try FileIO.read(tempFile), "hello\nworld")
    }

    func testWriteThenReadRoundTrip() throws {
        try FileIO.write("Round trip text", to: tempFile)
        XCTAssertEqual(try FileIO.read(tempFile), "Round trip text")
    }

    func testWriteIsAtomic() throws {
        try FileIO.write("first", to: tempFile)
        try FileIO.write("second", to: tempFile)
        XCTAssertEqual(try FileIO.read(tempFile), "second")
    }
}
