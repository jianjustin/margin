# Margin M3.6 (TitleBar + StatusBar + StatsCalculator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M3.5 placeholder `EditorToolbar` with a real 38pt `TitleBar` that matches the redesign mockup (transparent native title bar with traffic lights, centered breadcrumb, dirty dot, four toolbar buttons), and add a 28pt `StatusBar` to the editor pane reading from a new `StatsCalculator`. After M3.6, the window chrome and the editor's bottom strip are aligned with the design; only block-level editor chrome (M3.8) remains before the redesign is visually complete.

**Architecture:**
- A custom NSWindow configuration enables `titlebarAppearsTransparent` + `titleVisibility = .hidden` + `.fullSizeContentView` so SwiftUI can paint the 38pt-high titlebar row itself while keeping the system's traffic-light buttons.
- `TitleBar.swift` is a SwiftUI view inserted at the top of `RootView`'s body (above the existing `NavigationSplitView` / `NoVaultView`) inside a zero-spacing `VStack`. It carries breadcrumb, dirty dot, and four toolbar buttons; only the theme toggle is functional in M3.6 (sidebar / settings / drawer buttons render but are disabled stubs).
- `StatsCalculator.swift` hosts (a) a pure `Stats` struct, (b) a pure `StatsCalculator.compute(_:)` function over a `String`, and (c) an `@MainActor` `StatsTracker: ObservableObject` that debounces `noteBody` updates by 200ms and re-publishes a `Stats` value.
- `StatusBar.swift` is a SwiftUI view inserted at the bottom of `EditorView`'s `VStack`, observing `StatsTracker` and `AppState.dirty`.
- The M3.5 `EditorToolbar` (the temporary host for the theme toggle) is removed; `EditorView`'s `VStack` becomes `[MarkdownEditor, StatusBar]`.

**Tech Stack:** Swift 5.10+, SwiftUI on top of AppKit, swift-markdown (already a dependency) for the block count, XCTest.

**Spec:** [`2026-05-30-margin-editor-redesign.md`](../specs/2026-05-30-margin-editor-redesign.md) §4 (TitleBar / StatusBar / Stats) and §9 (the M3.5 toggle was always meant to migrate to TitleBar).

**Repo location:** `/Users/jianjustin/workspaces/margin`. Baseline commit at start of M3.6: `2d6425d`.

**Scope notes:**
- The sidebar / settings / drawer buttons are visual-only in M3.6. They render with `.disabled(true)` and an accessibility label so the layout is final; the actions are M3.7 / M7 / M9 respectively.
- The breadcrumb shows `<parent folder name>/<file name without extension>`. Deeper paths (`a/b/c/file`) collapse to `…/<parent>/<file>` so the titlebar never wraps.
- The block count uses swift-markdown's top-level children. Atomic markdown blocks (paragraph, heading, quote, list, code fence, divider, table) each count as 1. Empty input → 0 blocks.
- The reading-time formula matches the design (`max(1, round((cjk + english) / 320))`).
- `StatusBar` lives inside `EditorView` (per spec §4.2 — only spans the editor column, not the whole window).

---

## File Structure (after M3.6 complete)

```
margin/
├── Sources/Margin/
│   ├── MarginApp.swift                  # MODIFY: extend WindowAccessor to set titlebar transparency
│   ├── UI/
│   │   ├── TitleBar.swift               # NEW: 38pt top chrome
│   │   ├── StatusBar.swift              # NEW: 28pt bottom strip inside editor pane
│   │   ├── EditorView.swift             # MODIFY: drop EditorToolbar; add StatusBar; host StatsTracker
│   │   └── RootView.swift               # MODIFY: VStack(TitleBar, body)
│   └── Editor/
│       └── StatsCalculator.swift        # NEW: Stats struct + pure compute + debounced tracker
└── Tests/MarginTests/
    └── StatsCalculatorTests.swift       # NEW
```

---

## Conventions

- Run all commands from `/Users/jianjustin/workspaces/margin`. Run `xcodegen` after creating new Swift files anywhere under `Sources/` or `Tests/`.
- Tests use XCTest. Run via `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/<ClassName>`.
- Commit at the end of each task.
- `TitleBar` and `StatusBar` are pure SwiftUI views with no NSViewRepresentable. The only AppKit touchpoint in M3.6 is the NSWindow configuration in Task 1.

---

## Task 1: NSWindow chrome — transparent titlebar with full-size content

**Files:** Modify `Sources/Margin/MarginApp.swift`.

The existing `WindowAccessor` private struct already taps the underlying `NSWindow`. Extend it to set `titlebarAppearsTransparent`, hide the title text, and turn on `.fullSizeContentView` so the SwiftUI content can paint the 38pt region where the traffic lights live.

- [ ] **Step 1:** Read the current `Sources/Margin/MarginApp.swift`. Confirm the `WindowAccessor` struct exists and is used inside `WindowGroup` via `.background(WindowAccessor { … })`.

- [ ] **Step 2:** Replace the existing `.background(WindowAccessor { win in win.setFrameAutosaveName("MarginMainWindow") })` modifier with this expanded callback:

```swift
.background(WindowAccessor { win in
    win.setFrameAutosaveName("MarginMainWindow")
    win.titlebarAppearsTransparent = true
    win.titleVisibility = .hidden
    win.styleMask.insert(.fullSizeContentView)
    // No system toolbar; the SwiftUI TitleBar paints this region.
    win.toolbarStyle = .unified
    win.isMovableByWindowBackground = false
})
```

Leave everything else in `MarginApp.swift` untouched (StateObjects, `.task`, command groups, `.windowStyle(.titleBar)` etc.).

- [ ] **Step 3:** Build to confirm the configuration compiles.

Run: `xcodegen >/dev/null && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4:** Run the full test suite (sanity).

Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3`
Expected: passes (75 tests).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/MarginApp.swift
git commit -m "feat(window): transparent titlebar + full-size content for upcoming TitleBar"
```

---

## Task 2: TitleBar.swift skeleton + RootView integration

**Files:**
- Create: `Sources/Margin/UI/TitleBar.swift`
- Modify: `Sources/Margin/UI/RootView.swift`

Introduce an empty 38pt-high TitleBar with the correct background, bottom separator, and a 70pt left inset for traffic lights. Wrap the existing `RootView` body in a `VStack(spacing: 0)` so the TitleBar sits above the `NavigationSplitView`. Breadcrumb and buttons land in Tasks 3-4.

- [ ] **Step 1:** Create `Sources/Margin/UI/TitleBar.swift`:

```swift
import SwiftUI

/// 38pt high chrome that replaces the system title bar. The window is
/// configured with `titlebarAppearsTransparent + fullSizeContentView`
/// (see MarginApp.swift), so this view paints behind the native traffic
/// lights. The leading 70pt is reserved for those buttons.
struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 0) {
            // Reserved gutter for the macOS traffic-light buttons.
            Color.clear.frame(width: 70)
            Spacer(minLength: 0)
            // Center + right slots arrive in Tasks 3-4.
        }
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .bottom
        )
    }
}
```

- [ ] **Step 2:** Edit `Sources/Margin/UI/RootView.swift`. The current body wraps a `Group { … }` with `.frame` / `.preferredColorScheme` / `.sheet` modifiers. Wrap the `Group` content in a `VStack(spacing: 0) { TitleBar(); … }` so the title bar always sits on top. Final shape:

```swift
import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        VStack(spacing: 0) {
            TitleBar()
            Group {
                if state.vaultRoot == nil {
                    NoVaultView(onChoose: { state.chooseVault() })
                } else {
                    ThreePaneView()
                }
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .preferredColorScheme(theme.mode == .dark ? .dark : .light)
        .sheet(isPresented: $state.searchSheetVisible) {
            SearchSheet()
                .environmentObject(state)
                .environmentObject(theme)
        }
    }
}

struct ThreePaneView: View {
    @EnvironmentObject var state: AppState
    @AppStorage(UserDefaultsKeys.sidebarWidth) private var sidebarWidth: Double = 240
    @AppStorage(UserDefaultsKeys.noteListWidth) private var noteListWidth: Double = 260

    var body: some View {
        NavigationSplitView {
            FileTreeView()
                .navigationSplitViewColumnWidth(min: 180, ideal: CGFloat(sidebarWidth), max: 360)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: CGFloat(noteListWidth), max: 400)
        } detail: {
            EditorView()
        }
        .navigationSplitViewStyle(.balanced)
    }
}
```

Preserve any other content that was in the original file (the `RootView` body's exact modifier chain on `.frame` + `.preferredColorScheme` + `.sheet` is shown above).

- [ ] **Step 3:** Regenerate the project and build.

Run: `xcodegen >/dev/null && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4:** Run the full suite.

Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3`
Expected: passes (75 tests).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/UI/TitleBar.swift Sources/Margin/UI/RootView.swift
git commit -m "feat(ui): TitleBar skeleton + RootView VStack wrapper"
```

---

## Task 3: TitleBar breadcrumb + dirty dot

**Files:** Modify `Sources/Margin/UI/TitleBar.swift`.

Add the centered breadcrumb (`<parent>/<file>`) and the dirty dot, leaving the right-side buttons slot empty (Task 4).

- [ ] **Step 1:** Replace `Sources/Margin/UI/TitleBar.swift` with:

```swift
import SwiftUI

/// 38pt high chrome that replaces the system title bar. The window is
/// configured with `titlebarAppearsTransparent + fullSizeContentView`
/// (see MarginApp.swift), so this view paints behind the native traffic
/// lights. The leading 70pt is reserved for those buttons.
struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                Color.clear.frame(width: 70)   // traffic lights gutter
                Spacer(minLength: 0)
                // Right-side button slot is added in Task 4.
            }
            BreadcrumbCenter()
                .environmentObject(state)
                .environmentObject(theme)
        }
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .bottom
        )
    }
}

private struct BreadcrumbCenter: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 8) {
            if let url = state.selectedNoteURL {
                if let parent = parentFolderName(for: url) {
                    Text(parent)
                        .foregroundStyle(Color(theme.palette.textFaint))
                    Text("/")
                        .foregroundStyle(Color(theme.palette.textFaint))
                }
                Text(url.deletingPathExtension().lastPathComponent)
                    .foregroundStyle(Color(theme.palette.textDim))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Circle()
                    .fill(Color(theme.palette.accent))
                    .frame(width: 6, height: 6)
                    .opacity(state.dirty ? 1 : 0)
                    .animation(.easeInOut(duration: 0.2), value: state.dirty)
                    .help("Unsaved changes")
            }
        }
        .font(.system(size: 12.5, weight: .medium))
        // Cap width so a long filename truncates instead of pushing the
        // right-side button slot off-screen.
        .frame(maxWidth: 420)
    }

    private func parentFolderName(for url: URL) -> String? {
        let parent = url.deletingLastPathComponent()
        let name = parent.lastPathComponent
        return name.isEmpty ? nil : name
    }
}
```

- [ ] **Step 2:** Build and run the full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 75 tests pass.

- [ ] **Step 3:** Commit.

```bash
git add Sources/Margin/UI/TitleBar.swift
git commit -m "feat(ui): TitleBar shows parent/file breadcrumb + dirty dot"
```

---

## Task 4: TitleBar toolbar buttons + remove EditorToolbar

**Files:**
- Modify: `Sources/Margin/UI/TitleBar.swift`
- Modify: `Sources/Margin/UI/EditorView.swift`

Add the four right-side buttons (sidebar / theme / settings / drawer) and migrate the theme toggle from the M3.5 `EditorToolbar`. With the toggle moved, `EditorToolbar` is no longer needed — drop it from `EditorView` so the VStack becomes `[MarkdownEditor]`. (StatusBar is added in Task 7.)

- [ ] **Step 1:** Replace `Sources/Margin/UI/TitleBar.swift` again — this time adding the right-side `ToolbarButtons` view:

```swift
import SwiftUI

struct TitleBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                Color.clear.frame(width: 70)
                Spacer(minLength: 0)
                ToolbarButtons()
                    .environmentObject(theme)
                    .padding(.trailing, 10)
            }
            BreadcrumbCenter()
                .environmentObject(state)
                .environmentObject(theme)
        }
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .bottom
        )
    }
}

private struct BreadcrumbCenter: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 8) {
            if let url = state.selectedNoteURL {
                if let parent = parentFolderName(for: url) {
                    Text(parent)
                        .foregroundStyle(Color(theme.palette.textFaint))
                    Text("/")
                        .foregroundStyle(Color(theme.palette.textFaint))
                }
                Text(url.deletingPathExtension().lastPathComponent)
                    .foregroundStyle(Color(theme.palette.textDim))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Circle()
                    .fill(Color(theme.palette.accent))
                    .frame(width: 6, height: 6)
                    .opacity(state.dirty ? 1 : 0)
                    .animation(.easeInOut(duration: 0.2), value: state.dirty)
                    .help("Unsaved changes")
            }
        }
        .font(.system(size: 12.5, weight: .medium))
        .frame(maxWidth: 420)
    }

    private func parentFolderName(for url: URL) -> String? {
        let parent = url.deletingLastPathComponent()
        let name = parent.lastPathComponent
        return name.isEmpty ? nil : name
    }
}

private struct ToolbarButtons: View {
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 2) {
            TBButton(systemName: "sidebar.left",
                     help: "切换笔记列表 (⌘B)",
                     enabled: false,
                     action: {})
            TBButton(systemName: theme.mode == .dark ? "sun.max" : "moon",
                     help: "切换主题",
                     enabled: true,
                     action: { theme.toggleMode() })
            TBButton(systemName: "gearshape",
                     help: "设置 (⌘,)",
                     enabled: false,
                     action: {})
            TBButton(systemName: "rectangle.grid.2x2",
                     help: "块库 (⌘\\)",
                     enabled: false,
                     action: {})
        }
    }
}

private struct TBButton: View {
    let systemName: String
    let help: String
    let enabled: Bool
    let action: () -> Void
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Color(enabled ? theme.palette.textDim : theme.palette.textFaint))
                .frame(width: 30, height: 26)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.clear)
                )
                .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .help(help)
    }
}
```

- [ ] **Step 2:** Replace `Sources/Margin/UI/EditorView.swift` with a slimmer version — no `EditorToolbar`, leaves room at the bottom for `StatusBar` (added in Task 7):

```swift
import SwiftUI
import AppKit

struct EditorView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        Group {
            if state.selectedNoteURL == nil {
                NoNoteSelectedView()
            } else {
                MarkdownEditor(text: $state.noteBody,
                               onChange: { state.bodyChanged() })
                    .background(Color(theme.palette.bg))
            }
        }
    }
}

private struct MarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    let onChange: () -> Void
    @EnvironmentObject var theme: ThemeStore

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let tv = scroll.documentView as? NSTextView else { return scroll }
        tv.delegate = context.coordinator
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isRichText = true
        tv.usesRuler = false
        tv.usesInspectorBar = false
        tv.allowsUndo = true
        tv.textContainerInset = NSSize(width: 48, height: 32)
        tv.backgroundColor = theme.palette.bg
        tv.insertionPointColor = theme.palette.accent
        tv.selectedTextAttributes = [.backgroundColor: theme.palette.selection]
        context.coordinator.typography = Typography.from(palette: theme.palette,
                                                         size: CGFloat(theme.fontSize),
                                                         fontKey: theme.fontKey)
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        let newTypo = Typography.from(palette: theme.palette,
                                      size: CGFloat(theme.fontSize),
                                      fontKey: theme.fontKey)
        let typoChanged = context.coordinator.typography.body != newTypo.body
            || context.coordinator.typography.primaryText != newTypo.primaryText
            || context.coordinator.typography.editorBackground != newTypo.editorBackground
        context.coordinator.typography = newTypo
        if typoChanged {
            tv.backgroundColor = newTypo.editorBackground
            tv.insertionPointColor = theme.palette.accent
            tv.selectedTextAttributes = [.backgroundColor: theme.palette.selection]
        }
        context.coordinator.syncIfNeeded(tv: tv, externalText: text, forceRestyle: typoChanged)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: MarkdownEditor
        var typography = Typography.current()
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        func syncIfNeeded(tv: NSTextView, externalText: String, forceRestyle: Bool = false) {
            if tv.string != externalText {
                let savedSelection = tv.selectedRange()
                suppressDelegate = true
                let styled = makeAttributed(text: externalText, cursor: 0)
                tv.textStorage?.setAttributedString(styled)
                let clampedLoc = min(savedSelection.location, externalText.utf16.count)
                tv.setSelectedRange(NSRange(location: clampedLoc, length: 0))
                suppressDelegate = false
            } else if forceRestyle {
                applyAttributes(tv: tv)
            }
        }

        func applyAttributes(tv: NSTextView) {
            let selection = tv.selectedRange()
            let cursor = selection.location
            let styled = makeAttributed(text: tv.string, cursor: cursor)
            suppressDelegate = true
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(selection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, cursor: Int) -> NSAttributedString {
            let active = ActiveParagraph.range(in: text, cursor: cursor)
            let activeOrNil: NSRange? = active.length > 0 ? active : nil
            return MarkdownStyler.style(text, activeRange: activeOrNil, typography: typography)
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            parent.text = tv.string
            parent.onChange()
            applyAttributes(tv: tv)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            applyAttributes(tv: tv)
        }
    }
}
```

- [ ] **Step 3:** Build + full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 75 tests pass.

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/UI/TitleBar.swift Sources/Margin/UI/EditorView.swift
git commit -m "feat(ui): TitleBar toolbar buttons; remove M3.5 EditorToolbar"
```

---

## Task 5: StatsCalculator.swift (pure compute) + tests

**Files:**
- Create: `Sources/Margin/Editor/StatsCalculator.swift`
- Create: `Tests/MarginTests/StatsCalculatorTests.swift`

Define the `Stats` struct and a pure `compute(_:)` function. The debounced tracker is added in Task 6.

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/StatsCalculatorTests.swift`:

```swift
import XCTest
@testable import Margin

final class StatsCalculatorTests: XCTestCase {

    func testEmptyTextYieldsZeros() {
        let s = StatsCalculator.compute("")
        XCTAssertEqual(s.chars, 0)
        XCTAssertEqual(s.words, 0)
        XCTAssertEqual(s.minutes, 1)      // floor is 1 minute per the design
        XCTAssertEqual(s.blocks, 0)
    }

    func testCharsCountExcludesWhitespace() {
        let s = StatsCalculator.compute("hello  world\n\n")
        XCTAssertEqual(s.chars, 10)   // "helloworld"
    }

    func testEnglishWordCount() {
        let s = StatsCalculator.compute("the quick brown fox")
        XCTAssertEqual(s.words, 4)
    }

    func testEnglishContractionsAreOneWord() {
        let s = StatsCalculator.compute("it's a test it-self")
        // "it's", "a", "test", "it-self" → 4
        XCTAssertEqual(s.words, 4)
    }

    func testCJKCharactersCountAsWords() {
        let s = StatsCalculator.compute("你好世界")
        XCTAssertEqual(s.words, 4)
        XCTAssertEqual(s.chars, 4)
    }

    func testMixedCJKAndEnglish() {
        let s = StatsCalculator.compute("hello 你好 world 世界")
        // 2 english words + 4 CJK chars = 6
        XCTAssertEqual(s.words, 6)
    }

    func testReadingTimeIsAtLeastOneMinute() {
        let s = StatsCalculator.compute("hello world")
        XCTAssertEqual(s.minutes, 1)
    }

    func testReadingTimeScalesAt320WPM() {
        // 640 english words → 2 minutes
        let text = String(repeating: "word ", count: 640)
        let s = StatsCalculator.compute(text)
        XCTAssertEqual(s.minutes, 2)
    }

    func testBlocksCountSimpleMarkdown() {
        let md = """
        # Heading

        Paragraph one.

        - item

        ```
        code
        ```
        """
        let s = StatsCalculator.compute(md)
        // heading, paragraph, list, code = 4 top-level blocks
        XCTAssertEqual(s.blocks, 4)
    }

    func testBlankInputYieldsZeroBlocks() {
        let s = StatsCalculator.compute("\n\n   \n")
        XCTAssertEqual(s.blocks, 0)
    }
}
```

- [ ] **Step 2:** Verify tests fail (StatsCalculator undefined).

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/StatsCalculatorTests -quiet 2>&1 | tail -10`
Expected: build error "cannot find 'StatsCalculator' in scope".

- [ ] **Step 3:** Implement `Sources/Margin/Editor/StatsCalculator.swift`:

```swift
import Foundation
import Markdown

/// Aggregated counters shown in the status bar.
struct Stats: Equatable {
    var chars: Int = 0
    var words: Int = 0
    var minutes: Int = 1
    var blocks: Int = 0

    static let empty = Stats()
}

/// Pure stat computation. The debounced tracker that publishes Stats lives
/// in StatsTracker (added in Task 6).
enum StatsCalculator {

    /// Reading speed used to derive the minutes value. Matches the design
    /// mockup's `editor.js#stats` formula (320 cjk-chars/words per minute).
    static let wordsPerMinute = 320

    private static let cjkRegex = try! NSRegularExpression(
        pattern: #"[\u{4E00}-\u{9FFF}\u{3040}-\u{30FF}\u{AC00}-\u{D7AF}]"#
    )
    private static let wordRegex = try! NSRegularExpression(
        pattern: #"[A-Za-z0-9]+(?:['\u{2019}\-][A-Za-z0-9]+)*"#
    )

    static func compute(_ text: String) -> Stats {
        let ns = text as NSString
        let range = NSRange(location: 0, length: ns.length)

        // chars: non-whitespace UTF-16 length
        var nonWS = 0
        text.unicodeScalars.forEach { sc in
            if !CharacterSet.whitespacesAndNewlines.contains(sc) { nonWS += 1 }
        }

        let cjk = cjkRegex.numberOfMatches(in: text, range: range)
        let eng = wordRegex.numberOfMatches(in: text, range: range)
        let total = cjk + eng

        let minutes = max(1, Int((Double(total) / Double(wordsPerMinute)).rounded()))

        let blocks: Int = {
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return 0 }
            let doc = Document(parsing: text)
            return doc.children.reduce(0) { $0 + 1 }
        }()

        return Stats(chars: nonWS, words: total, minutes: minutes, blocks: blocks)
    }
}
```

- [ ] **Step 4:** Run tests, expect pass.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/StatsCalculatorTests 2>&1 | grep -E "(Test Suite|passed|failed|error:)" | head -20`
Expected: all 10 tests pass.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/StatsCalculator.swift Tests/MarginTests/StatsCalculatorTests.swift
git commit -m "feat(editor): Stats struct + pure StatsCalculator.compute"
```

---

## Task 6: StatsTracker — debounced observable

**Files:**
- Modify: `Sources/Margin/Editor/StatsCalculator.swift` (append `StatsTracker` class)
- Modify: `Tests/MarginTests/StatsCalculatorTests.swift` (append a tracker test)

Add an `@MainActor` `StatsTracker: ObservableObject` that takes raw text via `schedule(_:)`, debounces 200ms, computes stats on a background queue, and publishes the result back on the main actor.

- [ ] **Step 1:** Append the tracker test to `Tests/MarginTests/StatsCalculatorTests.swift` (do NOT touch the existing tests):

```swift
@MainActor
final class StatsTrackerTests: XCTestCase {

    func testScheduledUpdatePublishesAfterDebounce() async throws {
        let t = StatsTracker(debounce: .milliseconds(50))
        XCTAssertEqual(t.stats, Stats.empty)

        t.schedule("hello world")
        try await Task.sleep(nanoseconds: 200_000_000)  // 200ms
        XCTAssertEqual(t.stats.words, 2)
        XCTAssertEqual(t.stats.chars, 10)
    }

    func testRapidUpdatesCoalesceToLast() async throws {
        let t = StatsTracker(debounce: .milliseconds(50))
        t.schedule("one")
        t.schedule("one two")
        t.schedule("one two three")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(t.stats.words, 3)
    }
}
```

- [ ] **Step 2:** Verify the new tests fail (StatsTracker undefined).

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/StatsTrackerTests -quiet 2>&1 | tail -5`
Expected: build error.

- [ ] **Step 3:** Append `StatsTracker` to `Sources/Margin/Editor/StatsCalculator.swift` (after the `StatsCalculator` enum):

```swift
/// Debounced observable that recomputes Stats from a stream of text updates.
/// Drop the latest text in via `schedule(_:)`; after the debounce window
/// expires it computes Stats off the main actor and publishes the result.
@MainActor
final class StatsTracker: ObservableObject {
    @Published private(set) var stats: Stats = .empty

    private let debounce: DispatchTimeInterval
    private var pendingTask: Task<Void, Never>?

    init(debounce: DispatchTimeInterval = .milliseconds(200)) {
        self.debounce = debounce
    }

    func schedule(_ text: String) {
        pendingTask?.cancel()
        pendingTask = Task { [weak self, debounce] in
            guard let nanos = debounce.nanoseconds else { return }
            try? await Task.sleep(nanoseconds: nanos)
            if Task.isCancelled { return }
            let computed = await Task.detached(priority: .utility) {
                StatsCalculator.compute(text)
            }.value
            if Task.isCancelled { return }
            self?.stats = computed
        }
    }
}

private extension DispatchTimeInterval {
    var nanoseconds: UInt64? {
        switch self {
        case .seconds(let s): return UInt64(s) * 1_000_000_000
        case .milliseconds(let ms): return UInt64(ms) * 1_000_000
        case .microseconds(let us): return UInt64(us) * 1_000
        case .nanoseconds(let ns): return UInt64(ns)
        default: return nil
        }
    }
}
```

- [ ] **Step 4:** Run tracker tests + full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/StatsTrackerTests 2>&1 | grep -E "(Test Suite|passed|failed|error:)" | head -10`
Expected: both tracker tests pass.

Then full suite:
`xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3`
Expected: 87 tests pass (75 baseline + 10 StatsCalculator + 2 StatsTracker).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/StatsCalculator.swift Tests/MarginTests/StatsCalculatorTests.swift
git commit -m "feat(editor): StatsTracker debounced observable"
```

---

## Task 7: StatusBar.swift + EditorView wiring

**Files:**
- Create: `Sources/Margin/UI/StatusBar.swift`
- Modify: `Sources/Margin/UI/EditorView.swift`

Add the 28pt bottom strip with five segments (chars / words / minutes / blocks / save-state). Wire it into `EditorView` via a `@StateObject StatsTracker` that observes `state.noteBody`.

- [ ] **Step 1:** Create `Sources/Margin/UI/StatusBar.swift`:

```swift
import SwiftUI

/// 28pt bottom strip living inside the editor pane.
/// Reads counters from a StatsTracker and the save state from AppState.
struct StatusBar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore
    @ObservedObject var tracker: StatsTracker

    var body: some View {
        HStack(spacing: 16) {
            segment("\(tracker.stats.chars) 字符")
            segment("\(tracker.stats.words) 词")
            segment("约 \(tracker.stats.minutes) 分钟")
            Spacer()
            segment("\(tracker.stats.blocks) 块")
            Text(state.dirty ? "保存中…" : "已同步")
                .foregroundStyle(Color(theme.palette.accent))
        }
        .font(.system(size: 11.5))
        .foregroundStyle(Color(theme.palette.textFaint))
        .padding(.horizontal, 16)
        .frame(height: 28)
        .frame(maxWidth: .infinity)
        .background(Color(theme.palette.bgPanel))
        .overlay(
            Color(theme.palette.borderSoft).frame(height: 0.5),
            alignment: .top
        )
    }

    @ViewBuilder
    private func segment(_ text: String) -> some View {
        Text(text)
    }
}
```

- [ ] **Step 2:** Edit `Sources/Margin/UI/EditorView.swift` to host the tracker and put `StatusBar` at the bottom. Replace the file with:

```swift
import SwiftUI
import AppKit

struct EditorView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore
    @StateObject private var tracker = StatsTracker()

    var body: some View {
        Group {
            if state.selectedNoteURL == nil {
                NoNoteSelectedView()
            } else {
                VStack(spacing: 0) {
                    MarkdownEditor(text: $state.noteBody,
                                   onChange: { state.bodyChanged() })
                        .background(Color(theme.palette.bg))
                    StatusBar(tracker: tracker)
                        .environmentObject(state)
                        .environmentObject(theme)
                }
                .onAppear { tracker.schedule(state.noteBody) }
                .onChange(of: state.noteBody) { _, newValue in
                    tracker.schedule(newValue)
                }
                .onChange(of: state.selectedNoteURL) { _, _ in
                    tracker.schedule(state.noteBody)
                }
            }
        }
    }
}

private struct MarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    let onChange: () -> Void
    @EnvironmentObject var theme: ThemeStore

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let tv = scroll.documentView as? NSTextView else { return scroll }
        tv.delegate = context.coordinator
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isRichText = true
        tv.usesRuler = false
        tv.usesInspectorBar = false
        tv.allowsUndo = true
        tv.textContainerInset = NSSize(width: 48, height: 32)
        tv.backgroundColor = theme.palette.bg
        tv.insertionPointColor = theme.palette.accent
        tv.selectedTextAttributes = [.backgroundColor: theme.palette.selection]
        context.coordinator.typography = Typography.from(palette: theme.palette,
                                                         size: CGFloat(theme.fontSize),
                                                         fontKey: theme.fontKey)
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        let newTypo = Typography.from(palette: theme.palette,
                                      size: CGFloat(theme.fontSize),
                                      fontKey: theme.fontKey)
        let typoChanged = context.coordinator.typography.body != newTypo.body
            || context.coordinator.typography.primaryText != newTypo.primaryText
            || context.coordinator.typography.editorBackground != newTypo.editorBackground
        context.coordinator.typography = newTypo
        if typoChanged {
            tv.backgroundColor = newTypo.editorBackground
            tv.insertionPointColor = theme.palette.accent
            tv.selectedTextAttributes = [.backgroundColor: theme.palette.selection]
        }
        context.coordinator.syncIfNeeded(tv: tv, externalText: text, forceRestyle: typoChanged)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: MarkdownEditor
        var typography = Typography.current()
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        func syncIfNeeded(tv: NSTextView, externalText: String, forceRestyle: Bool = false) {
            if tv.string != externalText {
                let savedSelection = tv.selectedRange()
                suppressDelegate = true
                let styled = makeAttributed(text: externalText, cursor: 0)
                tv.textStorage?.setAttributedString(styled)
                let clampedLoc = min(savedSelection.location, externalText.utf16.count)
                tv.setSelectedRange(NSRange(location: clampedLoc, length: 0))
                suppressDelegate = false
            } else if forceRestyle {
                applyAttributes(tv: tv)
            }
        }

        func applyAttributes(tv: NSTextView) {
            let selection = tv.selectedRange()
            let cursor = selection.location
            let styled = makeAttributed(text: tv.string, cursor: cursor)
            suppressDelegate = true
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(selection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, cursor: Int) -> NSAttributedString {
            let active = ActiveParagraph.range(in: text, cursor: cursor)
            let activeOrNil: NSRange? = active.length > 0 ? active : nil
            return MarkdownStyler.style(text, activeRange: activeOrNil, typography: typography)
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            parent.text = tv.string
            parent.onChange()
            applyAttributes(tv: tv)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            applyAttributes(tv: tv)
        }
    }
}
```

- [ ] **Step 3:** Build + full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 87 tests pass.

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/UI/StatusBar.swift Sources/Margin/UI/EditorView.swift
git commit -m "feat(ui): StatusBar in editor pane; debounced live stats"
```

---

## Task 8: Manual smoke verification doc

**Files:**
- Create: `docs/M3.6-verification.md`

- [ ] **Step 1:** Write `docs/M3.6-verification.md`:

```markdown
# M3.6 — TitleBar + StatusBar verification

Run `xcodegen && open Margin.xcodeproj`, build & launch, open any note, then check:

## TitleBar
- [ ] The native window title bar is gone; a 38pt panel-colored strip sits at the top
- [ ] Traffic lights (red/yellow/green) remain visible and clickable in their normal location
- [ ] Center shows `<parent folder>/<file name>` in two text weights (faint slash, dim name)
- [ ] Editing the note → a small gold dot appears next to the file name
- [ ] Saving (Cmd-S or auto) → dot fades out
- [ ] Right side shows four buttons in this order: sidebar / sun-or-moon / gear / grid
- [ ] Only the sun/moon button responds to clicks; the other three are visibly disabled (faint)
- [ ] Sun/moon click toggles dark ↔ light theme; the entire window restyles instantly
- [ ] After toggle, the icon swaps (dark mode shows sun, light mode shows moon)

## StatusBar (bottom of editor pane)
- [ ] A 28pt strip sits at the bottom of the editor column (matches the panel color of the title bar)
- [ ] Left segments show `<n> 字符`, `<n> 词`, `约 <n> 分钟`
- [ ] Right segments show `<n> 块` and a state pill: `已同步` (gold) or `保存中…` (gold)
- [ ] Type into the editor → after a brief debounce (~200ms) the counters update
- [ ] Counters cover BOTH CJK (你好) AND English mixed
- [ ] Open an empty note → counters show `0 字符 0 词 约 1 分钟 0 块`
- [ ] Open a multi-block markdown (heading + paragraph + list) → block count > 1

## Regressions to verify
- [ ] M3.5 active-paragraph behavior still works (`#` markers appear when caret enters heading line, disappear when it leaves)
- [ ] Editor body / link / tag colors still pull from the theme
- [ ] Toggling theme persists across relaunch

## Unit tests
Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
- [ ] All tests pass (StatsCalculator + StatsTracker + M3.5 + M1–M3)
```

- [ ] **Step 2:** Sanity-run automated checks before committing:
   - `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3` → all pass.
   - `grep -rn "EditorToolbar" Sources/` → should return nothing (M3.5 toolbar fully removed).
   - `xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build 2>&1 | tail -3` → BUILD SUCCEEDED.

- [ ] **Step 3:** Commit.

```bash
git add docs/M3.6-verification.md
git commit -m "docs: M3.6 verification checklist"
```

---

## Self-review checklist

After every task lands, verify:

- **Spec coverage:**
  - §4.1 TitleBar — height, color, breadcrumb, dirty dot, 4 buttons, disabled stubs for sidebar/settings/drawer → Tasks 1-4.
  - §4.2 StatusBar — height, layout, five segments, save state pill → Task 7.
  - §4.3 StatsCalculator — CJK / English split, 320 wpm formula, swift-markdown block count, 200ms debounce → Tasks 5-6.
- **Placeholder scan:** no `TODO`/`TBD`/`fill in` anywhere in the plan; every step has runnable code or a runnable command.
- **Type consistency:** `Stats`, `StatsCalculator`, `StatsTracker`, `TitleBar`, `StatusBar`, `TBButton` — names match across tasks.
- **Removed surface:** the M3.5 `EditorToolbar` struct must be gone after Task 4; verify in Task 8 via grep.

After M3.6 lands, M3.7 (file-tree row polish) and M3.8 (block chrome) are the remaining redesign milestones; each gets its own plan.
