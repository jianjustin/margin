import Foundation
import AppKit

enum VaultPickerError: Error {
    case userCancelled
    case bookmarkFailed
    case bookmarkResolveFailed
    case staleBookmark
}

struct VaultPicker {
    /// Show NSOpenPanel and let the user choose a vault root.
    /// Persists a security-scoped bookmark to UserDefaults.
    static func chooseVault() throws -> URL {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Vault"
        panel.message = "Select your Obsidian vault root directory."
        panel.title = "Select Vault"

        let response = panel.runModal()
        guard response == .OK, let url = panel.url else {
            throw VaultPickerError.userCancelled
        }

        try persistBookmark(for: url)
        return url
    }

    static func persistBookmark(for url: URL) throws {
        do {
            let data = try url.bookmarkData(
                options: [.withSecurityScope],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            UserDefaults.standard.set(data, forKey: UserDefaultsKeys.vaultBookmark)
        } catch {
            throw VaultPickerError.bookmarkFailed
        }
    }

    static func resolveStoredVault() throws -> URL? {
        guard let data = UserDefaults.standard.data(forKey: UserDefaultsKeys.vaultBookmark) else {
            return nil
        }
        var isStale = false
        let url: URL
        do {
            url = try URL(
                resolvingBookmarkData: data,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
        } catch {
            throw VaultPickerError.bookmarkResolveFailed
        }
        if isStale {
            throw VaultPickerError.staleBookmark
        }
        _ = url.startAccessingSecurityScopedResource()
        return url
    }

    static func clearStoredVault() {
        UserDefaults.standard.removeObject(forKey: UserDefaultsKeys.vaultBookmark)
    }
}
