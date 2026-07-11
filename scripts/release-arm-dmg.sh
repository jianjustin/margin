#!/usr/bin/env bash
# One-command Apple Silicon (arm64) release for Margin.
#
# Automates the manual flow documented in docs/release-updater.md:
#   version bump (package.json / Cargo.toml / tauri.conf.json)
#   → verification gate (typecheck + full test suite)
#   → tauri release build (ad-hoc macOS signing + signed updater artifacts)
#   → canonical asset preparation (scripts/prepare-release-assets.mjs)
#   → DMG integrity + codesign verification
#   → release commit, git push, GitHub Release with assets
#
# Usage:
#   scripts/release-arm-dmg.sh <version> [--notes-file <path>] [--dry-run]
#
#   <version>        Semver like 2.4.0 (tag becomes v2.4.0).
#   --notes-file     Markdown file used as the GitHub Release body and the
#                    updater manifest notes. Falls back to a generic line.
#   --dry-run        Do everything except commit, push, and create the release.
#
# Preconditions (checked before touching anything):
#   - clean working tree on branch main
#   - `gh` authenticated, `pnpm`/`node`/`cargo` on PATH
#   - updater private key at $HOME/.config/margin/margin-updater.key
#   - tag v<version> not already used locally or on the remote
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KEY_FILE="$HOME/.config/margin/margin-updater.key"
REPO="jianjustin/margin"

VERSION="${1:-}"
NOTES_FILE=""
DRY_RUN=0
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --notes-file) NOTES_FILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() { echo "✗ $1" >&2; exit 1; }
step() { echo; echo "── $1"; }

# ── Preconditions ────────────────────────────────────────────────
step "Preconditions"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "version must be X.Y.Z, got: '$VERSION'"
[ "$(git branch --show-current)" = "main" ] || fail "not on main"
[ -z "$(git status --porcelain)" ] || fail "working tree not clean"
[ -f "$KEY_FILE" ] || fail "updater private key missing: $KEY_FILE"
command -v pnpm >/dev/null || fail "pnpm not found"
command -v node >/dev/null || fail "node not found"
command -v cargo >/dev/null || fail "cargo not found"
gh auth status >/dev/null 2>&1 || fail "gh not authenticated"
if git rev-parse "v$VERSION" >/dev/null 2>&1; then fail "tag v$VERSION already exists locally"; fi
if gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then fail "release v$VERSION already exists on GitHub"; fi
if [ -n "$NOTES_FILE" ]; then [ -f "$NOTES_FILE" ] || fail "notes file not found: $NOTES_FILE"; fi
echo "✓ version v$VERSION, main clean, key + gh ready"

# ── Version bump (3 files; Cargo.lock follows during build) ──────
step "Version bump → $VERSION"
node -e '
  const fs = require("fs")
  const version = process.argv[1]
  for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"))
    json.version = version
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n")
  }
' "$VERSION"
# Only the [package] version on line-start; dependency versions are indented or inline.
sed -i '' "0,/^version = \".*\"/s//version = \"$VERSION\"/" src-tauri/Cargo.toml
grep -q "^version = \"$VERSION\"" src-tauri/Cargo.toml || fail "Cargo.toml bump failed"
echo "✓ package.json / tauri.conf.json / Cargo.toml"

# ── Verification gate ────────────────────────────────────────────
step "Verification gate (typecheck + full test suite)"
pnpm typecheck
pnpm test
echo "✓ typecheck + tests green"

# ── Build (ad-hoc signing + signed updater artifacts) ────────────
step "Tauri release build (aarch64, ad-hoc signed)"
TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
pnpm release:build:adhoc
echo "✓ build complete"

# ── Canonical assets ─────────────────────────────────────────────
step "Prepare release assets"
NOTES_ARG="Margin $VERSION release."
if [ -n "$NOTES_FILE" ]; then
  # latest.json notes must be a short single line; take the file's first heading-free line.
  NOTES_ARG="$(grep -v '^#' "$NOTES_FILE" | grep -m1 . || echo "Margin $VERSION release.")"
fi
pnpm release:prepare --version="$VERSION" --arch=arm64 --notes="$NOTES_ARG"
ASSET_DIR="dist/release/v$VERSION"
DMG="$ASSET_DIR/Margin-$VERSION-arm64.dmg"
for f in "$DMG" "$ASSET_DIR/Margin.app.tar.gz" "$ASSET_DIR/Margin.app.tar.gz.sig" "$ASSET_DIR/latest.json"; do
  [ -f "$f" ] || fail "expected asset missing: $f"
done
echo "✓ assets in $ASSET_DIR"

# ── DMG verification ─────────────────────────────────────────────
step "Verify DMG + app signature"
hdiutil verify "$DMG"
MOUNT="$(mktemp -d /tmp/margin-release-check.XXXXXX)"
hdiutil attach "$DMG" -mountpoint "$MOUNT" -nobrowse -readonly >/dev/null
codesign --verify --deep --strict --verbose=2 "$MOUNT/Margin.app"
hdiutil detach "$MOUNT" >/dev/null
echo "✓ DMG verified, ad-hoc signature structurally valid"

if [ "$DRY_RUN" = "1" ]; then
  step "Dry run — stopping before commit/push/release"
  echo "Version files are bumped and assets built in $ASSET_DIR."
  echo "Revert with: git checkout -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock"
  exit 0
fi

# ── Commit, push, release ────────────────────────────────────────
step "Release commit + push"
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore(release): v$VERSION"
git push origin main
echo "✓ pushed main"

step "GitHub Release v$VERSION"
GH_NOTES_ARGS=(--notes "Margin $VERSION release.")
if [ -n "$NOTES_FILE" ]; then GH_NOTES_ARGS=(--notes-file "$NOTES_FILE"); fi
gh release create "v$VERSION" \
  "$DMG" \
  "$ASSET_DIR/Margin.app.tar.gz" \
  "$ASSET_DIR/Margin.app.tar.gz.sig" \
  "$ASSET_DIR/latest.json" \
  --repo "$REPO" \
  --title "Margin v$VERSION" \
  --latest \
  "${GH_NOTES_ARGS[@]}"
echo
echo "✓ released: https://github.com/$REPO/releases/tag/v$VERSION"
