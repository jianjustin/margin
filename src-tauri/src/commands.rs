use crate::file_watcher::{self, WatcherState};
use crate::fs_ops;
use crate::path_policy::assert_safe_path;
use crate::vault_scanner;
use crate::vault_scanner::TreeNode;
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
// Vault scanning
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn scan_vault(
    root: String,
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

    Ok(vault_scanner::scan_vault(&root))
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
