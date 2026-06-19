use crate::file_watcher::{self, WatcherState};
use crate::fs_ops;
use crate::path_policy::assert_safe_path;
use crate::vault_scanner;
use crate::vault_scanner::TreeNode;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/// Managed state for the vault file watchers — one per vault root.
pub struct WatcherManager(pub Mutex<HashMap<String, WatcherState>>);

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

/// Create a new peer (fully-functional) window. Optionally targets a specific
/// file by passing `open` and `vault` query parameters.
#[tauri::command]
pub fn create_peer_window(
    app: tauri::AppHandle,
    open: Option<String>,
    vault: Option<String>,
) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let label = format!("win-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    let mut url = String::from("index.html?blank=1");
    if let (Some(ref file), Some(ref root)) = (&open, &vault) {
        url = format!(
            "index.html?open={}&vault={}",
            urlencoding(file),
            urlencoding(root)
        );
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("Margin")
        .inner_size(1280.0, 800.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

/// Minimal percent-encoding for URL query parameters.
fn urlencoding(s: &str) -> String {
    s.replace('%', "%25")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
        .replace('?', "%3F")
}

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

fn sanitize_asset_dir(assets_dir: &str) -> Result<String, String> {
    let clean = assets_dir.trim().trim_matches('/').to_string();
    if clean.is_empty()
        || clean.contains("..")
        || clean.contains('\\')
        || clean.split('/').any(|seg| seg.is_empty() || seg.starts_with('.'))
    {
        return Err("Invalid asset directory".to_string());
    }
    Ok(clean)
}

fn sanitize_asset_name(file_name: &str) -> Result<String, String> {
    let clean = file_name.trim();
    if clean.is_empty() || clean.contains('/') || clean.contains('\\') || clean.starts_with('.') {
        return Err("Invalid asset file name".to_string());
    }
    Ok(clean.to_string())
}

fn unique_asset_path(dir: &Path, file_name: &str) -> PathBuf {
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = path.extension().and_then(|e| e.to_str());

    let mut candidate = dir.join(file_name);
    let mut n = 1u32;
    while candidate.exists() {
        let next = match ext {
            Some(e) => format!("{}-{}.{}", stem, n, e),
            None => format!("{}-{}", stem, n),
        };
        candidate = dir.join(next);
        n += 1;
    }
    candidate
}

fn vault_relative(root: &str, path: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(root)
        .map_err(|_| "Asset path is outside the vault".to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn path_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        _ => "image/png",
    }
}

fn media_extension_from_mime(mime: &str, url_path: &str) -> &'static str {
    let lower_path = url_path.to_ascii_lowercase();
    if lower_path.ends_with(".mp4") {
        return "mp4";
    }
    if lower_path.ends_with(".webm") {
        return "webm";
    }
    if lower_path.ends_with(".mov") {
        return "mov";
    }
    if lower_path.ends_with(".mp3") {
        return "mp3";
    }
    if lower_path.ends_with(".wav") {
        return "wav";
    }
    if lower_path.ends_with(".ogg") {
        return "ogg";
    }
    match mime {
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/quicktime" => "mov",
        "audio/mpeg" => "mp3",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        "audio/mp4" => "m4a",
        "audio/aac" => "aac",
        "audio/flac" => "flac",
        _ => "bin",
    }
}

fn hash_url(url: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    hasher.finish()
}

fn validate_http_url(url: &str, label: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid {} URL: {}", label, e))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(format!("{} URL must use http or https", label));
    }
    Ok(parsed)
}

#[tauri::command]
pub fn import_asset_from_path(
    root: String,
    source_path: String,
    assets_dir: String,
) -> Result<String, String> {
    assert_safe_path(&root)?;
    assert_safe_path(&source_path)?;
    let assets_dir = sanitize_asset_dir(&assets_dir)?;
    let source = Path::new(&source_path);
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Cannot determine asset file name".to_string())?;
    let name = sanitize_asset_name(name)?;
    let dir = Path::new(&root).join(&assets_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create asset directory: {}", e))?;
    let dest = unique_asset_path(&dir, &name);
    std::fs::copy(source, &dest).map_err(|e| format!("Could not import asset: {}", e))?;
    vault_relative(&root, &dest)
}

#[tauri::command]
pub fn write_asset_bytes(
    root: String,
    file_name: String,
    bytes: Vec<u8>,
    assets_dir: String,
) -> Result<String, String> {
    assert_safe_path(&root)?;
    let assets_dir = sanitize_asset_dir(&assets_dir)?;
    let name = sanitize_asset_name(&file_name)?;
    let dir = Path::new(&root).join(&assets_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create asset directory: {}", e))?;
    let dest = unique_asset_path(&dir, &name);
    std::fs::write(&dest, bytes).map_err(|e| format!("Could not write asset: {}", e))?;
    vault_relative(&root, &dest)
}

#[tauri::command]
pub fn read_asset_bytes(path: String) -> Result<Vec<u8>, String> {
    assert_safe_path(&path)?;
    std::fs::read(&path).map_err(|e| format!("Could not read asset: {}", e))
}

#[tauri::command]
pub fn read_asset_data_url(path: String) -> Result<String, String> {
    let bytes = read_asset_bytes(path.clone())?;
    let mime = path_mime_type(Path::new(&path));
    Ok(format!("data:{};base64,{}", mime, BASE64_STANDARD.encode(bytes)))
}

fn diagram_endpoint(server_url: &str, kind: &str) -> Result<String, String> {
    let base = server_url.trim().trim_end_matches('/');
    validate_http_url(base, "diagram server")?;
    let kroki_kind = if kind == "dot" { "graphviz" } else { kind };
    Ok(format!("{}/{}/svg", base, kroki_kind))
}

#[tauri::command]
pub async fn read_remote_data_url(url: String) -> Result<String, String> {
    validate_http_url(&url, "remote media")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Could not create remote media client: {}", e))?;
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Remote media request failed: {}", e))?;
    let status = res.status();
    if !status.is_success() {
        return Err(format!("Remote media returned {}", status));
    }
    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .filter(|v| !v.is_empty())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Could not read remote media: {}", e))?;
    Ok(format!("data:{};base64,{}", mime, BASE64_STANDARD.encode(bytes)))
}

#[tauri::command]
pub async fn cache_remote_media(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let parsed = validate_http_url(&url, "remote media")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Could not create remote media client: {}", e))?;
    let res = client
        .get(url.clone())
        .send()
        .await
        .map_err(|e| format!("Remote media request failed: {}", e))?;
    let status = res.status();
    if !status.is_success() {
        return Err(format!("Remote media returned {}", status));
    }
    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .filter(|v| !v.is_empty())
        .unwrap_or("application/octet-stream")
        .to_string();
    let ext = media_extension_from_mime(&mime, parsed.path());
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Could not read remote media: {}", e))?;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Could not locate app cache: {}", e))?
        .join("remote-media");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create media cache: {}", e))?;
    let dest = dir.join(format!("{:016x}.{}", hash_url(&url), ext));
    std::fs::write(&dest, bytes).map_err(|e| format!("Could not write media cache: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn render_remote_diagram(
    server_url: String,
    kind: String,
    code: String,
) -> Result<String, String> {
    let endpoint = diagram_endpoint(&server_url, &kind)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Could not create diagram client: {}", e))?;
    let res = client
        .post(endpoint)
        .header(reqwest::header::CONTENT_TYPE, "text/plain")
        .body(code)
        .send()
        .await
        .map_err(|e| format!("Diagram request failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Could not read diagram response: {}", e))?;
    if !status.is_success() {
        return Err(format!("Diagram server returned {}: {}", status, text));
    }
    Ok(text)
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

    // Create a watcher for this vault root only if one doesn't already exist.
    {
        let mut guard = watcher_manager
            .0
            .lock()
            .map_err(|e| format!("Watcher lock poisoned: {}", e))?;
        if !guard.contains_key(&root) {
            let watcher = file_watcher::start_watching(&root, app)?;
            guard.insert(root.clone(), watcher);
        }
    }

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

#[cfg(target_os = "macos")]
fn finder_open_command(path: &str) -> (&'static str, Vec<String>) {
    ("open", vec!["-R".to_string(), path.to_string()])
}

#[tauri::command]
pub fn open_path_in_finder(path: String) -> Result<(), String> {
    assert_safe_path(&path)?;
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err("Open in Finder is only supported on macOS".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let (program, args) = finder_open_command(&path);
        let status = Command::new(program)
            .args(args)
            .status()
            .map_err(|e| format!("Could not open Finder: {}", e))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("Finder exited with status: {}", status))
        }
    }
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

    #[test]
    fn asset_import_writes_unique_relative_paths() {
        let root = std::env::temp_dir().join("__margin_test_assets__");
        let source_dir = std::env::temp_dir().join("__margin_test_asset_source__");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&source_dir);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("pic.png");
        std::fs::write(&source, b"png").unwrap();

        let root_s = root.to_string_lossy().to_string();
        let source_s = source.to_string_lossy().to_string();

        assert_eq!(
            import_asset_from_path(root_s.clone(), source_s.clone(), "assets".into()).unwrap(),
            "assets/pic.png"
        );
        assert_eq!(
            import_asset_from_path(root_s.clone(), source_s.clone(), "assets".into()).unwrap(),
            "assets/pic-1.png"
        );
        assert_eq!(
            write_asset_bytes(root_s.clone(), "paste.png".into(), vec![1, 2], "assets".into()).unwrap(),
            "assets/paste.png"
        );
        assert_eq!(read_asset_bytes(root.join("assets/paste.png").to_string_lossy().to_string()).unwrap(), vec![1, 2]);
        assert_eq!(
            read_asset_data_url(root.join("assets/paste.png").to_string_lossy().to_string()).unwrap(),
            "data:image/png;base64,AQI="
        );
        assert_eq!(path_mime_type(Path::new("demo.mp4")), "video/mp4");
        assert_eq!(media_extension_from_mime("audio/mpeg", "/audio"), "mp3");
        assert_eq!(media_extension_from_mime("video/mp4", "/path/movie.bin"), "mp4");
        assert!(validate_http_url("file:///tmp/demo.mp4", "remote media").is_err());
        assert_eq!(
            diagram_endpoint("https://kroki.io/", "dot").unwrap(),
            "https://kroki.io/graphviz/svg"
        );
        assert!(diagram_endpoint("file:///tmp", "plantuml").is_err());
        assert!(write_asset_bytes(root_s, "paste.png".into(), vec![], "../bad".into()).is_err());

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn finder_open_command_reveals_target_on_macos() {
        let path = "/vault/folder/note.md";
        let (program, args) = finder_open_command(path);

        assert_eq!(program, "open");
        assert_eq!(args, vec!["-R".to_string(), path.to_string()]);
    }
}
