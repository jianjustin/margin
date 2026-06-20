use crate::path_policy::assert_safe_path;
use std::fs;
use std::io::Read;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::path::{Path, PathBuf};

/// Find a non-colliding path by appending `-1`, `-2`, ... before the extension.
fn unique_path(dir: &str, name: &str) -> PathBuf {
    let dir_path = Path::new(dir);
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let ext = path.extension().and_then(|e| e.to_str());

    let mut candidate = dir_path.join(name);
    let mut n = 1u32;
    while candidate.exists() {
        let new_name = match ext {
            Some(e) => format!("{}-{}.{}", stem, n, e),
            None => format!("{}-{}", stem, n),
        };
        candidate = dir_path.join(new_name);
        n += 1;
    }
    candidate
}

/// Reject names that are empty, contain path separators, or start with a dot.
fn assert_safe_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.starts_with('.')
    {
        return Err("Invalid name".to_string());
    }
    Ok(())
}

/// Whether a filename has a markdown extension.
fn has_md_ext(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Create a new markdown note in `dir`; `.md` is appended if missing. Returns
/// the path.
pub fn create_note(dir: &str, name: &str) -> Result<String, String> {
    assert_safe_name(name)?;
    assert_safe_path(dir)?;

    let file_name = if has_md_ext(name) {
        name.to_string()
    } else {
        format!("{}.md", name)
    };

    let path = unique_path(dir, &file_name);
    fs::write(&path, "").map_err(|e| format!("Could not create note: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

/// Create a new folder in `dir`. Returns the path.
pub fn create_folder(dir: &str, name: &str) -> Result<String, String> {
    assert_safe_name(name)?;
    assert_safe_path(dir)?;

    let path = unique_path(dir, name);
    fs::create_dir(&path).map_err(|e| format!("Could not create folder: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

/// Rename a file/folder within its directory. Returns the new path.
pub fn rename_path(old_path: &str, new_name: &str) -> Result<String, String> {
    assert_safe_name(new_name)?;
    assert_safe_path(old_path)?;

    let old = Path::new(old_path);
    let dir = old
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;
    let dir_str = dir.to_string_lossy().to_string();

    // If the old path was markdown and the new name lacks the extension, add it.
    let final_name = if has_md_ext(old_path) && !has_md_ext(new_name) {
        format!("{}.md", new_name)
    } else {
        new_name.to_string()
    };

    let naive_path = dir.join(&final_name);
    if naive_path == old {
        return Ok(old_path.to_string());
    }

    let new_path = unique_path(&dir_str, &final_name);
    fs::rename(old_path, &new_path)
        .map_err(|e| format!("Could not rename: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// Move a file/folder to the OS trash (never a hard delete).
///
/// On macOS, `NSFileManager::trashItemAtURL` (used by the `trash` crate)
/// is intercepted by File Provider extensions (OneDrive, iCloud).  Those
/// extensions may refuse the request even when files are fully downloaded.
///
/// Strategy:
/// 1. Recursively touch every file so evicted stubs are materialized.
/// 2. Try `trash::delete`.
/// 3. On macOS, fall back to telling Finder to delete the item — Finder
///    has the entitlements to coordinate with File Provider extensions.
pub fn trash_path(path: &str) -> Result<(), String> {
    assert_safe_path(path)?;
    materialize_tree(Path::new(path));

    match trash::delete(path) {
        Ok(()) => Ok(()),
        Err(e) => {
            #[cfg(target_os = "macos")]
            {
                trash_via_finder(path)
                    .map_err(|finder_err| format!("Could not trash: {} / Finder fallback: {}", e, finder_err))
            }
            #[cfg(not(target_os = "macos"))]
            {
                Err(format!("Could not trash: {}", e))
            }
        }
    }
}

/// Ask Finder to move `path` to the Trash via AppleScript.  Finder has
/// broader entitlements than a third-party app and can reliably handle
/// File Provider items (OneDrive, iCloud).
#[cfg(target_os = "macos")]
fn trash_via_finder(path: &str) -> Result<(), String> {
    // Escape backslashes and double-quotes for AppleScript string literal.
    let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "tell application \"Finder\" to delete POSIX file \"{}\"",
        escaped
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Could not launch osascript: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("{} {}", stderr.trim(), stdout.trim()).trim().to_string())
    }
}

/// Touch every file under `root` so the OS downloads any evicted stubs
/// before we operate on the tree.  Best-effort — we never fail here.
///
/// `std::fs::metadata` on an evicted stub (iCloud / OneDrive Files
/// On-Demand) returns cached attributes *without* triggering a download.
/// We must actually open the file and read at least one byte to force
/// the File Provider to materialize its content.
fn materialize_tree(root: &Path) {
    if root.is_dir() {
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    materialize_tree(&p);
                } else {
                    materialize_file(&p);
                }
            }
        }
    } else if root.is_symlink() {
        // Resolve symlinks and materialize the target.
        if let Ok(target) = std::fs::read_link(root) {
            materialize_tree(&target);
        }
    } else {
        materialize_file(root);
    }
}

/// Open `path` and read one byte to force the File Provider (iCloud,
/// OneDrive, etc.) to materialize the file content.
fn materialize_file(path: &Path) {
    if let Ok(mut f) = std::fs::File::open(path) {
        let mut buf = [0u8; 1];
        let _ = (&mut f).take(1).read(&mut buf);
    }
}

/// Move a file/folder into `dest_dir`, keeping its original name. Creates
/// `dest_dir` if missing and disambiguates with -1, -2, ... on a name
/// collision. Returns the new path (or the unchanged path when already in
/// `dest_dir`).
pub fn move_path(src_path: &str, dest_dir: &str) -> Result<String, String> {
    assert_safe_path(src_path)?;
    assert_safe_path(dest_dir)?;

    let src = Path::new(src_path);
    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Cannot determine file name".to_string())?;

    fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Could not create destination directory: {}", e))?;

    let naive_path = Path::new(dest_dir).join(name);
    if naive_path == src {
        return Ok(src_path.to_string());
    }

    let new_path = unique_path(dest_dir, name);
    fs::rename(src_path, &new_path)
        .map_err(|e| format!("Could not move: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// Ensure a markdown note exists at `dir/name` (`.md` appended if missing),
/// creating `dir` and seeding the file with `template` only when it does not
/// yet exist. Idempotent -- an existing note is left untouched. Returns the
/// path.
pub fn ensure_note(dir: &str, name: &str, template: &str) -> Result<String, String> {
    assert_safe_name(name)?;
    assert_safe_path(dir)?;

    let file_name = if has_md_ext(name) {
        name.to_string()
    } else {
        format!("{}.md", name)
    };

    fs::create_dir_all(dir)
        .map_err(|e| format!("Could not create directory: {}", e))?;

    let path = Path::new(dir).join(&file_name);
    if !path.exists() {
        fs::write(&path, template)
            .map_err(|e| format!("Could not create note: {}", e))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_assert_safe_name() {
        assert!(assert_safe_name("hello").is_ok());
        assert!(assert_safe_name("").is_err());
        assert!(assert_safe_name(".hidden").is_err());
        assert!(assert_safe_name("a/b").is_err());
        assert!(assert_safe_name("a\\b").is_err());
    }

    #[test]
    fn test_unique_path_no_collision() {
        let dir = std::env::temp_dir();
        let dir_str = dir.to_string_lossy().to_string();
        let result = unique_path(&dir_str, "__margin_test_nonexistent__.md");
        assert!(result
            .to_string_lossy()
            .ends_with("__margin_test_nonexistent__.md"));
    }

    #[test]
    fn test_create_note() {
        let dir = std::env::temp_dir().join("__margin_test_create_note__");
        let _ = fs::create_dir_all(&dir);
        let dir_str = dir.to_string_lossy().to_string();

        let result = create_note(&dir_str, "test_note");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with(".md"));
        assert!(Path::new(&path).exists());

        // Cleanup
        let _ = fs::remove_dir_all(&dir);
    }
}
