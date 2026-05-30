import XCTest
@testable import Margin

final class IndexLocationTests: XCTestCase {
    func testReturnsURLUnderApplicationSupportMargin() throws {
        let url = try IndexLocation.default()
        XCTAssertTrue(url.path.hasSuffix("/Margin/index.sqlite"),
                      "expected …/Margin/index.sqlite, got \(url.path)")
        let dir = url.deletingLastPathComponent()
        var isDir: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.path, isDirectory: &isDir))
        XCTAssertTrue(isDir.boolValue)
    }
}
