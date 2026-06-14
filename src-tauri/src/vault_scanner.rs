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

const BUILT_IN_HIDDEN_DIRS: &[&str] = &[".margin", ".obsidian", ".git", ".trash"];
const BUILT_IN_HIDDEN_FILES: &[&str] = &[".DS_Store"];

#[derive(Default)]
struct HiddenFolderRules {
    names: Vec<String>,
    paths: Vec<String>,
}

fn normalize_rule(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let trimmed = normalized.trim_matches('/').trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn hidden_rules(raw: &[String]) -> HiddenFolderRules {
    let mut rules = HiddenFolderRules::default();
    for value in raw {
        let Some(rule) = normalize_rule(value) else {
            continue;
        };
        if rule.contains('/') {
            if !rules.paths.contains(&rule) {
                rules.paths.push(rule);
            }
        } else if !rules.names.contains(&rule) {
            rules.names.push(rule);
        }
    }
    rules
}

fn should_hide_dir(name: &str, relative_path: &str, rules: &HiddenFolderRules) -> bool {
    BUILT_IN_HIDDEN_DIRS.contains(&name)
        || rules.names.iter().any(|rule| rule == name)
        || rules.paths.iter().any(|rule| rule == relative_path)
}

fn should_hide_file(name: &str) -> bool {
    BUILT_IN_HIDDEN_FILES.contains(&name)
}

/// Recursively scan `root` into a `Vec<TreeNode>`: folders (including empty
/// ones) and ordinary files. Built-in protected folders and configured hidden
/// folders are skipped. Each level is sorted folders-first, then files, each
/// group alphabetical (locale-aware). Unreadable entries are silently skipped.
pub fn scan_vault(root: &str, hidden_folders: &[String]) -> Vec<TreeNode> {
    let root_path = Path::new(root);
    let rules = hidden_rules(hidden_folders);
    scan_dir(root_path, root_path, &rules)
}

fn scan_dir(root_path: &Path, current_path: &Path, rules: &HiddenFolderRules) -> Vec<TreeNode> {
    let entries = match fs::read_dir(current_path) {
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

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();

        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let relative_path = path
                .strip_prefix(root_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if should_hide_dir(&name, &relative_path, rules) {
                continue;
            }
            folders.push(TreeNode {
                name,
                path: path_str.clone(),
                node_type: "folder".to_string(),
                children: Some(scan_dir(root_path, &path, rules)),
            });
        } else if file_type.is_file() && !should_hide_file(&name) {
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
    use std::path::PathBuf;

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn scan_nonexistent_returns_empty() {
        let result = scan_vault("/tmp/__margin_test_nonexistent_dir__", &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn scan_includes_non_markdown_files() {
        let root = test_root("__margin_scan_non_markdown_files__");
        std::fs::write(root.join("note.md"), "x").unwrap();
        std::fs::write(root.join("asset.pdf"), "x").unwrap();

        let result = scan_vault(root.to_str().unwrap(), &[]);
        let names: Vec<_> = result.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"note.md"));
        assert!(names.contains(&"asset.pdf"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scan_hides_ds_store_files() {
        let root = test_root("__margin_scan_hides_ds_store__");
        std::fs::create_dir_all(root.join("Folder")).unwrap();
        std::fs::write(root.join(".DS_Store"), "x").unwrap();
        std::fs::write(root.join("Folder").join(".DS_Store"), "x").unwrap();
        std::fs::write(root.join("Folder").join("asset.pdf"), "x").unwrap();

        let result = scan_vault(root.to_str().unwrap(), &[]);
        assert!(result.iter().all(|n| n.name != ".DS_Store"));
        let folder = result
            .iter()
            .find(|n| n.node_type == "folder" && n.name == "Folder")
            .unwrap();
        let children = folder.children.as_ref().unwrap();
        assert!(children.iter().all(|n| n.name != ".DS_Store"));
        assert!(children.iter().any(|n| n.name == "asset.pdf"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scan_shows_normal_dot_dirs_but_hides_built_ins() {
        let root = test_root("__margin_scan_dot_dirs__");
        std::fs::create_dir_all(root.join(".claude")).unwrap();
        std::fs::write(root.join(".claude").join("note.md"), "x").unwrap();
        for name in [".margin", ".obsidian", ".git", ".trash"] {
            std::fs::create_dir_all(root.join(name)).unwrap();
            std::fs::write(root.join(name).join("hidden.md"), "x").unwrap();
        }

        let result = scan_vault(root.to_str().unwrap(), &[]);
        let names: Vec<_> = result.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&".claude"));
        assert!(!names.contains(&".margin"));
        assert!(!names.contains(&".obsidian"));
        assert!(!names.contains(&".git"));
        assert!(!names.contains(&".trash"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scan_applies_name_and_relative_path_hidden_rules() {
        let root = test_root("__margin_scan_hidden_rules__");
        std::fs::create_dir_all(root.join("A").join(".claude")).unwrap();
        std::fs::create_dir_all(root.join("B").join(".claude")).unwrap();
        std::fs::create_dir_all(root.join("Projects").join("archive")).unwrap();
        std::fs::create_dir_all(root.join("Other").join("archive")).unwrap();
        std::fs::write(root.join("Projects").join("archive").join("note.md"), "x").unwrap();
        std::fs::write(root.join("Other").join("archive").join("note.md"), "x").unwrap();

        let hidden = vec![".claude".to_string(), "Projects/archive".to_string()];
        let result = scan_vault(root.to_str().unwrap(), &hidden);

        fn folder<'a>(nodes: &'a [TreeNode], name: &str) -> &'a TreeNode {
            nodes
                .iter()
                .find(|n| n.node_type == "folder" && n.name == name)
                .unwrap()
        }

        let a = folder(&result, "A");
        assert!(a.children.as_ref().unwrap().iter().all(|n| n.name != ".claude"));
        let b = folder(&result, "B");
        assert!(b.children.as_ref().unwrap().iter().all(|n| n.name != ".claude"));
        let projects = folder(&result, "Projects");
        assert!(projects.children.as_ref().unwrap().iter().all(|n| n.name != "archive"));
        let other = folder(&result, "Other");
        assert!(other.children.as_ref().unwrap().iter().any(|n| n.name == "archive"));

        let _ = std::fs::remove_dir_all(root);
    }
}
