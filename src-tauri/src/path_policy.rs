/// Protected Obsidian-vault directory segments that must never be accessed.
const PROTECTED_SEGMENTS: &[&str] = &[".obsidian", ".trash", ".git"];

/// Returns `false` if `p` is empty or any path segment exactly matches a
/// protected Obsidian-vault directory (`.obsidian`, `.trash`, `.git`).
/// Splits on both `/` and `\` so it works for paths from either platform.
pub fn is_safe_path(p: &str) -> bool {
    if p.is_empty() {
        return false;
    }
    for seg in p.split(&['/', '\\'][..]) {
        if PROTECTED_SEGMENTS.contains(&seg) {
            return false;
        }
    }
    true
}

/// Returns `Ok(())` when the path is safe, or `Err` with a descriptive message
/// when the path is empty or touches a protected directory.
pub fn assert_safe_path(p: &str) -> Result<(), String> {
    if is_safe_path(p) {
        Ok(())
    } else {
        Err(format!("Path is in a protected Obsidian directory: {}", p))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_normal_path() {
        assert!(is_safe_path("/Users/me/vault/notes/daily.md"));
    }

    #[test]
    fn rejects_empty() {
        assert!(!is_safe_path(""));
    }

    #[test]
    fn rejects_obsidian() {
        assert!(!is_safe_path("/Users/me/vault/.obsidian/plugins"));
    }

    #[test]
    fn rejects_trash() {
        assert!(!is_safe_path("/Users/me/vault/.trash/old.md"));
    }

    #[test]
    fn rejects_git() {
        assert!(!is_safe_path("/Users/me/vault/.git/HEAD"));
    }

    #[test]
    fn assert_safe_returns_err() {
        assert!(assert_safe_path("").is_err());
        assert!(assert_safe_path("/vault/.obsidian/config").is_err());
    }

    #[test]
    fn assert_safe_returns_ok() {
        assert!(assert_safe_path("/vault/notes").is_ok());
    }
}
