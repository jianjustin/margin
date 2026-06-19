// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod file_watcher;
mod fs_ops;
mod path_policy;
mod vault_scanner;

use commands::WatcherManager;
use std::collections::HashMap;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WatcherManager(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::create_peer_window,
            commands::open_file_dialog,
            commands::open_folder_dialog,
            commands::read_file,
            commands::write_file,
            commands::scan_vault,
            commands::create_note,
            commands::create_folder,
            commands::rename_path,
            commands::trash_path,
            commands::move_path,
            commands::open_path_in_finder,
            commands::ensure_note,
            commands::import_asset_from_path,
            commands::write_asset_bytes,
            commands::read_asset_bytes,
            commands::read_asset_data_url,
            commands::read_remote_data_url,
            commands::cache_remote_media,
            commands::render_remote_diagram,
            commands::read_project_config,
            commands::write_project_config,
            commands::write_draft,
            commands::read_draft,
            commands::delete_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}
