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
                restoreLastNote()
            }
        } catch {
            VaultPicker.clearStoredVault()
        }
    }

    private func restoreLastNote() {
        guard let root = vaultRoot,
              let path = UserDefaults.standard.string(forKey: UserDefaultsKeys.lastSelectedNotePath)
        else { return }
        let url = URL(fileURLWithPath: path)
        // Must still exist AND be inside the vault (security + correctness).
        guard FileManager.default.fileExists(atPath: url.path),
              url.path.hasPrefix(root.path + "/")
        else { return }
        openNote(url)
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

    private var autoSaveTask: Task<Void, Never>?

    func bodyChanged() {
        dirty = true
        autoSaveTask?.cancel()
        autoSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.saveCurrent() }
        }
    }

    func openNote(_ url: URL) {
        autoSaveTask?.cancel()
        if dirty, let current = selectedNoteURL {
            try? FileIO.write(noteBody, to: current)
            dirty = false
        }
        selectedNoteURL = url
        noteBody = (try? FileIO.read(url)) ?? ""
        dirty = false
        UserDefaults.standard.set(url.path, forKey: UserDefaultsKeys.lastSelectedNotePath)
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

    private func isPathInside(_ child: URL, _ parent: URL) -> Bool {
        let p = parent.path
        let c = child.path
        return c == p || c.hasPrefix(p + "/")
    }

    private func collectNotes(in nodes: [VaultNode], currentPath: URL?, target: URL) -> [URL] {
        if currentPath == target {
            return nodes.compactMap { if case .note(let u) = $0 { return u } else { return nil } }
        }
        for node in nodes {
            if case .folder(let url, let children) = node, isPathInside(target, url) {
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
            if case .folder(let url, let nested) = node, isPathInside(target, url) {
                if let hit = collectNotesIn(folderURL: url, children: nested, target: target) {
                    return hit
                }
            }
        }
        return nil
    }
}
