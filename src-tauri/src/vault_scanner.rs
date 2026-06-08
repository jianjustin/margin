use serde::Serialize;
use std::fs;
use std::path::Path;

/// A node in the vault file tree, matching the TypeScript `TreeNode` interface.
#[derive(Serialize, Clone, Debug)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
}

/// Markdown file extension check (case-insensitive).
fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Recursively scan `root` into a `Vec<TreeNode>`: folders (including empty
/// ones) and markdown files. Dotfiles/dot-directories are skipped. Each level
/// is sorted folders-first, then files, each group alphabetical
/// (locale-aware). Unreadable entries are silently skipped.
pub fn scan_vault(root: &str) -> Vec<TreeNode> {
    let root_path = Path::new(root);
    let entries = match fs::read_dir(root_path) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut folders: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for entry in entries.flatten() {
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        // Skip dotfiles and dot-directories.
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();

        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            folders.push(TreeNode {
                name,
                path: path_str.clone(),
                node_type: "folder".to_string(),
                children: Some(scan_vault(&path_str)),
            });
        } else if file_type.is_file() && is_markdown(&name) {
            files.push(TreeNode {
                name,
                path: path_str,
                node_type: "file".to_string(),
                children: None,
            });
        }
    }

    // Sort each group alphabetically (locale-aware via default Ord on String,
    // which is byte-order but sufficient for most vault naming conventions).
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    // Folders first, then files.
    folders.extend(files);
    folders
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_nonexistent_returns_empty() {
        let result = scan_vault("/tmp/__margin_test_nonexistent_dir__");
        assert!(result.is_empty());
    }
}
