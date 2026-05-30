import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var vaultRoot: URL?
    @Published var tree: [VaultNode] = []
    @Published var selectedFolder: URL?
    @Published var selectedNoteURL: URL?
    @Published var noteBody: String = ""
    @Published var dirty: Bool = false

    func loadStoredVault() {
        do {
            if let url = try VaultPicker.resolveStoredVault() {
                openVault(url: url)
            }
        } catch {
            VaultPicker.clearStoredVault()
        }
    }

    func chooseVault() {
        do {
            let url = try VaultPicker.chooseVault()
            openVault(url: url)
        } catch VaultPickerError.userCancelled {
            // no-op
        } catch {
            NSLog("Vault pick error: \(error)")
        }
    }

    func openVault(url: URL) {
        vaultRoot = url
        rescan()
    }

    func rescan() {
        guard let root = vaultRoot else { tree = []; return }
        tree = VaultScanner().scan(root: root)
    }

    func selectFolder(_ url: URL?) {
        selectedFolder = url
    }

    func openNote(_ url: URL) {
        if dirty, let current = selectedNoteURL {
            try? FileIO.write(noteBody, to: current)
            dirty = false
        }
        selectedNoteURL = url
        noteBody = (try? FileIO.read(url)) ?? ""
        dirty = false
    }

    func saveCurrent() {
        guard let url = selectedNoteURL else { return }
        try? FileIO.write(noteBody, to: url)
        dirty = false
    }

    func notesInSelectedFolder() -> [URL] {
        let folder = selectedFolder ?? vaultRoot
        guard let folder else { return [] }
        return collectNotes(in: tree, currentPath: vaultRoot, target: folder)
    }

    private func collectNotes(in nodes: [VaultNode], currentPath: URL?, target: URL) -> [URL] {
        if currentPath == target {
            return nodes.compactMap { if case .note(let u) = $0 { return u } else { return nil } }
        }
        for node in nodes {
            if case .folder(let url, let children) = node, target.path.hasPrefix(url.path) {
                if let hit = collectNotesIn(folderURL: url, children: children, target: target) {
                    return hit
                }
            }
        }
        return []
    }

    private func collectNotesIn(folderURL: URL, children: [VaultNode], target: URL) -> [URL]? {
        if folderURL == target {
            return children.compactMap { if case .note(let u) = $0 { return u } else { return nil } }
        }
        for node in children {
            if case .folder(let url, let nested) = node, target.path.hasPrefix(url.path) {
                if let hit = collectNotesIn(folderURL: url, children: nested, target: target) {
                    return hit
                }
            }
        }
        return nil
    }
}
