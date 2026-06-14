use crate::file_watcher::{self, WatcherState};
use crate::fs_ops;
use crate::path_policy::assert_safe_path;
use crate::vault_scanner;
use crate::vault_scanner::TreeNode;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// Managed state for the vault file watcher.
pub struct WatcherManager(pub Mutex<Option<WatcherState>>);

// ---------------------------------------------------------------------------
// Dialog commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_file();

    match file {
        Some(f) => {
            let path = f.into_path().map_err(|e| format!("Invalid path: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();

    match folder {
        Some(f) => {
            let path = f.into_path().map_err(|e| format!("Invalid path: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// File I/O commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    assert_safe_path(&path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    assert_safe_path(&path)?;
    std::fs::write(&path, &content).map_err(|e| format!("Could not save file: {}", e))
}

// ---------------------------------------------------------------------------
// Project-level config (stored in a hidden `.margin/` directory in the vault)
// ---------------------------------------------------------------------------

/// Hidden vault directory holding project-level configuration.
const CONFIG_DIR: &str = ".margin";
/// Config file name within `CONFIG_DIR`.
const CONFIG_FILE: &str = "config.json";

/// Read `<root>/.margin/config.json`. Returns `None` when the file does not
/// exist yet (a fresh vault), or the raw JSON string when present.
#[tauri::command]
pub fn read_project_config(root: String) -> Result<Option<String>, String> {
    assert_safe_path(&root)?;
    let path = Path::new(&root).join(CONFIG_DIR).join(CONFIG_FILE);
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read project config: {}", e)),
    }
}

/// Write `<root>/.margin/config.json`, creating the hidden config directory if
/// needed. The directory is skipped by the vault scanner, so it never shows in
/// the file tree.
#[tauri::command]
pub fn write_project_config(root: String, content: String) -> Result<(), String> {
    assert_safe_path(&root)?;
    let dir = Path::new(&root).join(CONFIG_DIR);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create config directory: {}", e))?;
    let path = dir.join(CONFIG_FILE);
    std::fs::write(&path, &content).map_err(|e| format!("Could not write project config: {}", e))
}

// ---------------------------------------------------------------------------
// Crash-recovery drafts (stored flat in `<root>/.margin/drafts/`)
// ---------------------------------------------------------------------------

/// Subdirectory of CONFIG_DIR holding crash-recovery drafts.
const DRAFTS_DIR: &str = "drafts";

/// Flat, reversible draft file name for a note: the vault-relative path with
/// `%` and `/` percent-encoded, plus a trailing `.md`.
fn draft_file_path(root: &str, path: &str) -> std::path::PathBuf {
    let rel = path.strip_prefix(root).unwrap_or(path).trim_start_matches('/');
    let name = rel.replace('%', "%25").replace('/', "%2F");
    Path::new(root)
        .join(CONFIG_DIR)
        .join(DRAFTS_DIR)
        .join(format!("{}.md", name))
}

#[tauri::command]
pub fn write_draft(root: String, path: String, content: String) -> Result<(), String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    let file = draft_file_path(&root, &path);
    let dir = file.parent().ok_or("Invalid draft path")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Could not create drafts dir: {}", e))?;
    std::fs::write(&file, &content).map_err(|e| format!("Could not write draft: {}", e))
}

#[tauri::command]
pub fn read_draft(root: String, path: String) -> Result<Option<String>, String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    match std::fs::read_to_string(draft_file_path(&root, &path)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read draft: {}", e)),
    }
}

#[tauri::command]
pub fn delete_draft(root: String, path: String) -> Result<(), String> {
    assert_safe_path(&root)?;
    assert_safe_path(&path)?;
    match std::fs::remove_file(draft_file_path(&root, &path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete draft: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Vault scanning
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn scan_vault(
    root: String,
    hidden_folders: Vec<String>,
    app: tauri::AppHandle,
    watcher_manager: State<'_, WatcherManager>,
) -> Result<Vec<TreeNode>, String> {
    assert_safe_path(&root)?;

    // Start / restart the file watcher for this vault root.
    let new_watcher = file_watcher::start_watching(&root, app)?;
    let mut guard = watcher_manager
        .0
        .lock()
        .map_err(|e| format!("Watcher lock poisoned: {}", e))?;
    *guard = Some(new_watcher);

    Ok(vault_scanner::scan_vault(&root, &hidden_folders))
}

// ---------------------------------------------------------------------------
// File-system mutation commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_note(dir: String, name: String) -> Result<String, String> {
    fs_ops::create_note(&dir, &name)
}

#[tauri::command]
pub fn create_folder(dir: String, name: String) -> Result<String, String> {
    fs_ops::create_folder(&dir, &name)
}

#[tauri::command]
pub fn rename_path(old_path: String, new_name: String) -> Result<String, String> {
    fs_ops::rename_path(&old_path, &new_name)
}

#[tauri::command]
pub fn trash_path(path: String) -> Result<(), String> {
    fs_ops::trash_path(&path)
}

#[tauri::command]
pub fn move_path(src_path: String, dest_dir: String) -> Result<String, String> {
    fs_ops::move_path(&src_path, &dest_dir)
}

#[tauri::command]
pub fn ensure_note(dir: String, name: String, template: String) -> Result<String, String> {
    fs_ops::ensure_note(&dir, &name, &template)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_config_round_trip_and_missing() {
        let root = std::env::temp_dir().join("__margin_test_project_config__");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let root_str = root.to_string_lossy().to_string();

        // Missing config reads as None.
        assert_eq!(read_project_config(root_str.clone()).unwrap(), None);

        // Write then read back.
        write_project_config(root_str.clone(), "{\"scheduleDir\":\"X\"}".to_string()).unwrap();
        assert!(root.join(".margin").join("config.json").exists());
        assert_eq!(
            read_project_config(root_str.clone()).unwrap(),
            Some("{\"scheduleDir\":\"X\"}".to_string())
        );

        // Protected paths are rejected.
        assert!(read_project_config("/vault/.obsidian".to_string()).is_err());
        assert!(write_project_config("".to_string(), "{}".to_string()).is_err());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn draft_round_trip_missing_and_delete() {
        let root = std::env::temp_dir().join("__margin_test_drafts__");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("sub")).unwrap();
        let root_s = root.to_string_lossy().to_string();
        let note = root.join("sub").join("note.md").to_string_lossy().to_string();

        // Missing draft reads as None; deleting a missing draft is OK.
        assert_eq!(read_draft(root_s.clone(), note.clone()).unwrap(), None);
        assert!(delete_draft(root_s.clone(), note.clone()).is_ok());

        // Write → read back; file lives flat under .margin/drafts with encoded name.
        write_draft(root_s.clone(), note.clone(), "draft body".into()).unwrap();
        assert_eq!(
            read_draft(root_s.clone(), note.clone()).unwrap(),
            Some("draft body".to_string())
        );
        assert!(root.join(".margin").join("drafts").join("sub%2Fnote.md.md").exists());

        // Delete removes it.
        delete_draft(root_s.clone(), note.clone()).unwrap();
        assert_eq!(read_draft(root_s.clone(), note.clone()).unwrap(), None);

        // Path policy still applies.
        assert!(write_draft("".into(), note.clone(), "x".into()).is_err());

        let _ = std::fs::remove_dir_all(&root);
    }
}
