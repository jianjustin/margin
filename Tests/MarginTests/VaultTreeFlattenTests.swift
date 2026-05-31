import XCTest
@testable import Margin

final class VaultTreeFlattenTests: XCTestCase {

    private func folder(_ name: String, _ children: [VaultNode] = []) -> VaultNode {
        .folder(url: URL(fileURLWithPath: "/v/\(name)"), children: children)
    }
    private func note(_ name: String, at parent: String = "/v") -> VaultNode {
        .note(url: URL(fileURLWithPath: "\(parent)/\(name).md"))
    }

    func testFlatTreeOneLevel() {
        let nodes: [VaultNode] = [note("a"), note("b")]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].depth, 0)
        XCTAssertEqual(rows[0].isFolder, false)
        XCTAssertEqual(rows[0].name, "a")
    }

    func testCollapsedFolderHidesChildren() {
        let nodes: [VaultNode] = [folder("notes", [note("a", at: "/v/notes")])]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].isFolder, true)
        XCTAssertEqual(rows[0].isExpanded, false)
        XCTAssertEqual(rows[0].childCount, 1)
    }

    func testExpandedFolderShowsChildren() {
        let folderURL = URL(fileURLWithPath: "/v/notes")
        let nodes: [VaultNode] = [folder("notes", [note("a", at: "/v/notes")])]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [folderURL])
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[1].depth, 1)
        XCTAssertEqual(rows[1].name, "a")
    }

    func testNestedExpansion() {
        let outer = URL(fileURLWithPath: "/v/outer")
        let inner = URL(fileURLWithPath: "/v/outer/inner")
        let tree: [VaultNode] = [
            .folder(url: outer, children: [
                .folder(url: inner, children: [
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/leaf.md"))
                ])
            ])
        ]
        let rows = VaultTreeFlatten.flatten(nodes: tree, expanded: [outer, inner])
        XCTAssertEqual(rows.map(\.depth), [0, 1, 2])
        XCTAssertEqual(rows.map(\.name), ["outer", "inner", "leaf"])
    }

    func testIgnoredFlagOnDotfileName() {
        let nodes: [VaultNode] = [
            folder(".obsidian"),
            note(".DS_Store"),
            note("regular")
        ]
        let rows = VaultTreeFlatten.flatten(nodes: nodes, expanded: [])
        XCTAssertTrue(rows[0].isIgnored)
        XCTAssertTrue(rows[1].isIgnored)
        XCTAssertFalse(rows[2].isIgnored)
    }

    func testChildCountReflectsDirectChildrenOnly() {
        let inner = URL(fileURLWithPath: "/v/outer/inner")
        let tree: [VaultNode] = [
            .folder(url: URL(fileURLWithPath: "/v/outer"), children: [
                .folder(url: inner, children: [
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/a.md")),
                    .note(url: URL(fileURLWithPath: "/v/outer/inner/b.md"))
                ]),
                .note(url: URL(fileURLWithPath: "/v/outer/c.md"))
            ])
        ]
        let rows = VaultTreeFlatten.flatten(nodes: tree, expanded: [])
        // outer has 2 direct children: the `inner` folder and `c` note
        XCTAssertEqual(rows[0].childCount, 2)
    }
}
