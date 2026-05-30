# Margin M3 (Bear-style Inline Markdown Rendering) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1/M2 plain `NSTextView` rendering with **Bear-style inline Markdown rendering**: source Markdown stays untouched on disk, but the editor displays headings in larger weight, bold/italic with hidden delimiters, wiki-links in blue, code in mono, inline `#tags` colored, etc. The block currently containing the cursor ("active paragraph") shows the raw syntax; all other blocks hide it.

**Architecture:**
- `swift-markdown` (Apple) parses the body into an AST with `SourceLocation`s.
- A `RangeConverter` maps `Markdown.SourceRange` (1-indexed line/column) to `NSRange` (UTF-16 offsets) suitable for `NSAttributedString`.
- An `ActiveParagraphLocator` finds the paragraph (delimited by blank lines or block boundaries) containing the cursor.
- A `Typography` value type holds the SF Pro font/color palette (light + dark variants).
- A `MarkdownStyler` is a pure function `(String, activeRange: NSRange?) -> NSAttributedString` that emits one attribute run per AST node.
- `EditorView`'s `PlainTextEditor` is renamed `MarkdownEditor`; it owns the styling pipeline and rebuilds attributes on `textDidChange` and `selectionDidChange`.

**Tech Stack:** Swift 5.10+, `swift-markdown 0.4.x` via SPM, AppKit `NSTextView`/`NSAttributedString`, SwiftUI integration unchanged.

**Spec:** [`2026-05-30-bear-obsidian-mac-editor-design.md`](../specs/2026-05-30-bear-obsidian-mac-editor-design.md) §4 (editor rendering rules) and §4.3 (typography).

**Repo location:** `/Users/jianjustin/workspaces/margin` (tag `v0.2.0-m2` is the M2 baseline).

**Scope decision — "hide syntax" mechanism:** Bear's true zero-advance glyph hiding requires custom `NSTextLayoutFragment` work that is high-risk and high-cost. M3 uses **transparent-color hiding**: out-of-active-paragraph syntax characters get `foregroundColor = clear`. The characters still occupy horizontal space (a small accuracy compromise compared to Bear) but visual result is "they disappear." A fully space-collapsing pass is on the M7 polish backlog.

---

## File Structure (after M3 complete)

```
margin/
├── project.yml                          # +swift-markdown SPM dependency
├── Sources/Margin/
│   ├── Editor/                          # NEW (M3 owns this entire directory)
│   │   ├── Typography.swift             # font + color palette, light/dark aware
│   │   ├── RangeConverter.swift         # SourceRange ↔ NSRange
│   │   ├── ActiveParagraph.swift        # cursor → paragraph NSRange
│   │   └── MarkdownStyler.swift         # (text, active?) -> NSAttributedString
│   ├── UI/
│   │   └── EditorView.swift             # MODIFY: PlainTextEditor → MarkdownEditor
└── Tests/MarginTests/
    ├── RangeConverterTests.swift        # NEW
    ├── ActiveParagraphTests.swift       # NEW
    └── MarkdownStylerTests.swift        # NEW
```

---

## Conventions

- Commands from `/Users/jianjustin/workspaces/margin`. Run `xcodegen` after editing project.yml or adding files.
- TDD applies to `RangeConverter`, `ActiveParagraphLocator`, and `MarkdownStyler` (asserting attributes on specific ranges). `EditorView` integration is verified by manual smoke (M3 verification doc).
- No new tests for `Typography` — it's a passive value-type module.
- Threading: `MarkdownStyler` is a value-typed Sendable struct (pure function). EditorView calls it on main thread for now (the typical note is small enough); throttling/off-main can come in M7.

---

## Task 1: Add swift-markdown dependency

**Files:** Modify `project.yml`.

- [ ] **Step 1:** Edit `project.yml`. Find the existing top-level `packages:` block (containing `GRDB`) and add:

```yaml
packages:
  GRDB:
    url: https://github.com/groue/GRDB.swift
    from: 6.29.0
  Markdown:
    url: https://github.com/apple/swift-markdown
    from: 0.4.0
```

Then inside the `Margin` target's `dependencies:` list (currently containing only `- package: GRDB`), add a second entry:

```yaml
dependencies:
  - package: GRDB
    product: GRDB
  - package: Markdown
    product: Markdown
```

- [ ] **Step 2:** Regenerate + resolve.

```bash
cd /Users/jianjustin/workspaces/margin
xcodegen
xcodebuild -scheme Margin -destination "platform=macOS" -resolvePackageDependencies 2>&1 | tail -10
xcodebuild -scheme Margin -destination "platform=macOS" build 2>&1 | tail -5
```

Expect `** BUILD SUCCEEDED **`. swift-markdown pulls swift-cmark as a transitive dependency; the resolution may take 60-120s on first fetch.

- [ ] **Step 3:** Smoke import.

Temporarily append to `Sources/Margin/AppState.swift`:
```swift
import Markdown
```

Build. If green, GRDB is properly linked. Remove the smoke import before commit.

- [ ] **Step 4:** Tests still 39.

```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep "Executed"
```

- [ ] **Step 5:** Commit.

```bash
git add project.yml
git commit -m "build: add swift-markdown 0.4.x dependency"
```

---

## Task 2: Typography palette

**Files:** Create `Sources/Margin/Editor/Typography.swift`.

No new tests — passive type.

- [ ] **Step 1:** Create the file.

```swift
import AppKit

/// All fonts and colors used by MarkdownStyler.
/// Resolve via `Typography.current()` for the active appearance.
struct Typography {
    // MARK: Fonts
    let body: NSFont
    let bodyBold: NSFont
    let bodyItalic: NSFont
    let mono: NSFont
    let h1: NSFont
    let h2: NSFont
    let h3: NSFont
    let h4: NSFont    // used for H4-H6

    // MARK: Colors
    let primaryText: NSColor
    let secondaryText: NSColor
    let tertiaryText: NSColor
    let linkBlue: NSColor
    let tagPurple: NSColor
    let codeBackground: NSColor
    let quoteBar: NSColor
    let hiddenSyntax: NSColor  // = clear; transparent placeholder for non-active syntax

    // MARK: Paragraph metrics
    let bodyLineHeightMultiplier: CGFloat = 1.55
    let bodyParagraphSpacing: CGFloat = 8

    static func current() -> Typography {
        let bodyDescriptor = NSFontDescriptor(name: "SFPro-Regular", size: 16)
            .withDesign(.default) ?? NSFontDescriptor.preferredFontDescriptor(forTextStyle: .body)
        let body = NSFont(descriptor: bodyDescriptor, size: 16)
            ?? NSFont.systemFont(ofSize: 16)
        let bodyBold = NSFontManager.shared.convert(body, toHaveTrait: .boldFontMask)
        let bodyItalic = NSFontManager.shared.convert(body, toHaveTrait: .italicFontMask)
        let mono = NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)

        // SF Pro Display for big headings.
        let display = { (size: CGFloat) -> NSFont in
            let d = NSFontDescriptor(name: "SFPro-Bold", size: size)
            return NSFont(descriptor: d, size: size)
                ?? NSFont.systemFont(ofSize: size, weight: .bold)
        }

        return Typography(
            body: body,
            bodyBold: bodyBold,
            bodyItalic: bodyItalic,
            mono: mono,
            h1: display(28),
            h2: display(24),
            h3: display(20),
            h4: display(18),
            primaryText: NSColor.labelColor,
            secondaryText: NSColor.secondaryLabelColor,
            tertiaryText: NSColor.tertiaryLabelColor,
            linkBlue: NSColor(red: 0x4A/255, green: 0x90/255, blue: 0xE2/255, alpha: 1.0),
            tagPurple: NSColor(red: 0x58/255, green: 0x56/255, blue: 0xD6/255, alpha: 1.0),
            codeBackground: NSColor.quaternaryLabelColor.withAlphaComponent(0.18),
            quoteBar: NSColor.tertiaryLabelColor,
            hiddenSyntax: NSColor.clear
        )
    }

    /// Returns the right font for an H1..H6 level.
    func headingFont(level: Int) -> NSFont {
        switch level {
        case 1: return h1
        case 2: return h2
        case 3: return h3
        default: return h4
        }
    }
}
```

- [ ] **Step 2:** Build clean.

`xcodegen && xcodebuild ... build 2>&1 | tail -5` → BUILD SUCCEEDED. Tests still 39.

- [ ] **Step 3:** Commit.

```bash
git add Sources/Margin/Editor/Typography.swift
git commit -m "feat(editor): Typography palette (SF Pro + Bear colors)"
```

---

## Task 3: RangeConverter (TDD)

**Files:** Create `Sources/Margin/Editor/RangeConverter.swift`, `Tests/MarginTests/RangeConverterTests.swift`.

swift-markdown emits `Markup.range` as `SourceRange` with 1-indexed line + 1-indexed column (in UTF-8 codepoint terms). We need a UTF-16 `NSRange` for `NSAttributedString`. We'll only need the helper to convert a `SourceRange` plus the original `String` into an `NSRange`.

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/RangeConverterTests.swift`:

```swift
import XCTest
import Markdown
@testable import Margin

final class RangeConverterTests: XCTestCase {
    func testSingleLineASCII() {
        let text = "hello world"
        // Pretend a SourceRange covering "world" (column 7..11, 1-indexed; end is exclusive).
        let range = makeRange(line1: 1, col1: 7, line2: 1, col2: 12)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns, NSRange(location: 6, length: 5))
    }

    func testMultilineASCII() {
        let text = "alpha\nbeta gamma\ndelta"
        // SourceRange covering "beta " (line 2, col 1..6)
        let range = makeRange(line1: 2, col1: 1, line2: 2, col2: 6)
        let ns = RangeConverter.nsRange(of: range, in: text)
        // location: "alpha\n".utf16.count = 6
        XCTAssertEqual(ns, NSRange(location: 6, length: 5))
    }

    func testHandlesMultiByteUTF8() {
        // "你好" is 2 chars, 6 utf-8 bytes, 2 utf-16 code units.
        // swift-markdown returns column offsets in UTF-8 codepoints
        // (one increment per Unicode scalar).
        let text = "你好 world"
        // Cover "你好" — columns 1..3 (each CJK char is one column).
        let range = makeRange(line1: 1, col1: 1, line2: 1, col2: 3)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns, NSRange(location: 0, length: 2))
    }

    func testEndOfFileSpan() {
        let text = "abc\n"
        // line 2, col 1..1 (zero-length, immediately after \n)
        let range = makeRange(line1: 2, col1: 1, line2: 2, col2: 1)
        let ns = RangeConverter.nsRange(of: range, in: text)
        XCTAssertEqual(ns?.location, 4)
        XCTAssertEqual(ns?.length, 0)
    }

    func testReturnsNilForOutOfBoundsLine() {
        let text = "one\ntwo"
        let range = makeRange(line1: 5, col1: 1, line2: 5, col2: 4)
        XCTAssertNil(RangeConverter.nsRange(of: range, in: text))
    }

    private func makeRange(line1: Int, col1: Int, line2: Int, col2: Int) -> SourceRange {
        SourceRange(
            start: SourceLocation(line: line1, column: col1, source: nil),
            end:   SourceLocation(line: line2, column: col2, source: nil)
        )
    }
}
```

- [ ] **Step 2:** Confirm fail.

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'RangeConverter' in scope`.

- [ ] **Step 3:** Implement.

Create `Sources/Margin/Editor/RangeConverter.swift`:

```swift
import Foundation
import Markdown

enum RangeConverter {
    /// Maps a swift-markdown SourceRange (1-indexed line/column over Unicode scalars)
    /// to an NSRange measured in UTF-16 code units of `text`.
    /// Returns nil if the source line is out of bounds.
    static func nsRange(of range: SourceRange, in text: String) -> NSRange? {
        guard let start = utf16Offset(line: range.lowerBound.line,
                                      column: range.lowerBound.column,
                                      in: text) else { return nil }
        guard let end = utf16Offset(line: range.upperBound.line,
                                    column: range.upperBound.column,
                                    in: text) else { return nil }
        let length = max(0, end - start)
        return NSRange(location: start, length: length)
    }

    /// Returns the UTF-16 offset of (line, column) — both 1-indexed.
    /// `column` is interpreted as "this many Unicode scalars into the line".
    private static func utf16Offset(line: Int, column: Int, in text: String) -> Int? {
        guard line >= 1, column >= 1 else { return nil }
        var currentLine = 1
        var idx = text.startIndex
        // Walk to the start of `line`.
        while currentLine < line, idx < text.endIndex {
            if text[idx] == "\n" {
                currentLine += 1
                idx = text.index(after: idx)
            } else {
                idx = text.index(after: idx)
            }
        }
        if currentLine < line {
            // Permit "one past the end" — caller may request line=lastLine+1, col=1.
            if currentLine == line - 1 && column == 1 && idx == text.endIndex {
                return text.utf16.distance(from: text.utf16.startIndex,
                                           to: text.endIndex.samePosition(in: text.utf16) ?? text.utf16.endIndex)
            }
            return nil
        }
        // Now step `column - 1` Unicode scalars forward, stopping at \n or endIndex.
        var col = 1
        while col < column, idx < text.endIndex, text[idx] != "\n" {
            idx = text.index(after: idx)
            col += 1
        }
        // Distance in UTF-16 units from startIndex to idx.
        let utf16Index = idx.samePosition(in: text.utf16) ?? text.utf16.endIndex
        return text.utf16.distance(from: text.utf16.startIndex, to: utf16Index)
    }
}
```

- [ ] **Step 4:** Tests pass (44 total = 39 + 5 new).

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → 44.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/RangeConverter.swift Tests/MarginTests/RangeConverterTests.swift
git commit -m "feat(editor): RangeConverter for SourceRange ↔ NSRange"
```

---

## Task 4: ActiveParagraph locator (TDD)

**Files:** Create `Sources/Margin/Editor/ActiveParagraph.swift`, `Tests/MarginTests/ActiveParagraphTests.swift`.

The "active paragraph" is the text block that contains the cursor: starting from the most recent blank line (or string start) and extending to the next blank line (or string end).

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/ActiveParagraphTests.swift`:

```swift
import XCTest
@testable import Margin

final class ActiveParagraphTests: XCTestCase {
    func testFindsParagraphAroundCursor() {
        let text = """
        first paragraph
        still first
        
        second paragraph
        """
        let cursor = 5 // inside "first paragraph"
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "first paragraph\nstill first")
    }

    func testFindsSecondParagraph() {
        let text = "alpha\n\nbeta gamma"
        let cursor = 8 // inside "beta"
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "beta gamma")
    }

    func testCursorOnBlankLineReturnsEmptyRange() {
        let text = "x\n\ny"
        let cursor = 2 // on the blank line
        let r = ActiveParagraph.range(in: text, cursor: cursor)
        XCTAssertEqual(r.length, 0)
    }

    func testCursorAtVeryStart() {
        let text = "hello\n\nworld"
        let r = ActiveParagraph.range(in: text, cursor: 0)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "hello")
    }

    func testCursorAtVeryEnd() {
        let text = "alpha\n\nbeta"
        let r = ActiveParagraph.range(in: text, cursor: text.utf16.count)
        let extracted = (text as NSString).substring(with: r)
        XCTAssertEqual(extracted, "beta")
    }
}
```

- [ ] **Step 2:** Fail.

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → expect `Cannot find 'ActiveParagraph' in scope`.

- [ ] **Step 3:** Implement.

Create `Sources/Margin/Editor/ActiveParagraph.swift`:

```swift
import Foundation

enum ActiveParagraph {
    /// Returns the NSRange of the paragraph containing `cursor` (UTF-16 offset).
    /// A paragraph is delimited by blank lines (lines whose trimmed content is empty)
    /// or by string boundaries.
    /// If the cursor is on a blank line, returns a zero-length range at the cursor.
    static func range(in text: String, cursor: Int) -> NSRange {
        let ns = text as NSString
        let length = ns.length
        let cursor = max(0, min(cursor, length))

        // Determine the line index containing cursor (each line is the chars between \n boundaries).
        // Walk backward from cursor to find paragraph start.
        var paragraphStart = 0
        var i = cursor
        // Find the start of the current line.
        var lineStart = cursor
        while lineStart > 0 {
            let prev = ns.character(at: lineStart - 1)
            if prev == 0x0A { break } // \n
            lineStart -= 1
        }

        // If the current line is blank, return zero-length at cursor.
        var lineEnd = lineStart
        while lineEnd < length, ns.character(at: lineEnd) != 0x0A {
            lineEnd += 1
        }
        let currentLine = ns.substring(with: NSRange(location: lineStart, length: lineEnd - lineStart))
        if currentLine.trimmingCharacters(in: .whitespaces).isEmpty {
            return NSRange(location: cursor, length: 0)
        }

        // Walk up: while the previous line exists and is non-blank, expand paragraphStart.
        paragraphStart = lineStart
        while paragraphStart > 0 {
            // step to previous line's start
            var prevLineEnd = paragraphStart - 1 // index of '\n' or one past end
            if prevLineEnd < 0 { break }
            // prevLineEnd points at '\n'; find its line start
            var prevLineStart = prevLineEnd
            while prevLineStart > 0 {
                let prev = ns.character(at: prevLineStart - 1)
                if prev == 0x0A { break }
                prevLineStart -= 1
            }
            let prevLine = ns.substring(with: NSRange(location: prevLineStart,
                                                     length: prevLineEnd - prevLineStart))
            if prevLine.trimmingCharacters(in: .whitespaces).isEmpty {
                break
            }
            paragraphStart = prevLineStart
        }

        // Walk down from lineEnd: while next line exists and is non-blank, expand paragraphEnd.
        var paragraphEnd = lineEnd
        i = lineEnd
        while i < length {
            // i is at \n; step over it
            if ns.character(at: i) == 0x0A {
                let nextLineStart = i + 1
                if nextLineStart >= length { break }
                var nextLineEnd = nextLineStart
                while nextLineEnd < length, ns.character(at: nextLineEnd) != 0x0A {
                    nextLineEnd += 1
                }
                let nextLine = ns.substring(with: NSRange(location: nextLineStart,
                                                         length: nextLineEnd - nextLineStart))
                if nextLine.trimmingCharacters(in: .whitespaces).isEmpty {
                    break
                }
                paragraphEnd = nextLineEnd
                i = nextLineEnd
            } else {
                break
            }
        }

        return NSRange(location: paragraphStart, length: paragraphEnd - paragraphStart)
    }
}
```

- [ ] **Step 4:** Tests pass (49 total).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/ActiveParagraph.swift Tests/MarginTests/ActiveParagraphTests.swift
git commit -m "feat(editor): ActiveParagraph cursor → paragraph range"
```

---

## Task 5: MarkdownStyler (TDD)

**Files:** Create `Sources/Margin/Editor/MarkdownStyler.swift`, `Tests/MarginTests/MarkdownStylerTests.swift`.

This is the core attribute-emitting function. It walks the swift-markdown AST and produces an `NSAttributedString`. Syntax tokens (e.g., `#` in headings, `**` for bold, `[[ ]]` for wiki links) get either the normal foreground color (when inside the active range) or the hidden (clear) color (when outside).

- [ ] **Step 1: Tests first**

Create `Tests/MarginTests/MarkdownStylerTests.swift`:

```swift
import XCTest
import AppKit
@testable import Margin

final class MarkdownStylerTests: XCTestCase {
    let typo = Typography.current()

    func testBodyTextUsesBodyFont() {
        let a = MarkdownStyler.style("hello world", activeRange: nil, typography: typo)
        let attrs = a.attributes(at: 0, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.body)
    }

    func testHeadingLineGetsH1Font() {
        let text = "# Big Title"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // Pick a position over "Big" — index 2 (after "# ").
        let attrs = a.attributes(at: 2, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.h1)
    }

    func testHeadingMarkerHiddenWhenNotActive() {
        let text = "# Title"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        let markerAttrs = a.attributes(at: 0, effectiveRange: nil) // the '#'
        XCTAssertEqual(markerAttrs[.foregroundColor] as? NSColor, typo.hiddenSyntax)
    }

    func testHeadingMarkerVisibleWhenActive() {
        let text = "# Title"
        let active = NSRange(location: 0, length: text.utf16.count)
        let a = MarkdownStyler.style(text, activeRange: active, typography: typo)
        let markerAttrs = a.attributes(at: 0, effectiveRange: nil)
        XCTAssertEqual(markerAttrs[.foregroundColor] as? NSColor, typo.primaryText)
    }

    func testBoldRunUsesBoldFont() {
        let text = "say **hi** there"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // "hi" is at text offset 6..8
        let attrs = a.attributes(at: 6, effectiveRange: nil)
        XCTAssertEqual(attrs[.font] as? NSFont, typo.bodyBold)
    }

    func testWikiLinkRunIsBlue() {
        let text = "see [[A]] here"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // index 6 is 'A' — but wiki link is rendered, even though swift-markdown doesn't natively
        // parse [[wikilinks]], so we apply via a post-pass regex (see implementation).
        let attrs = a.attributes(at: 6, effectiveRange: nil)
        XCTAssertEqual(attrs[.foregroundColor] as? NSColor, typo.linkBlue)
    }

    func testInlineTagIsPurple() {
        let text = "use #tag here"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        // 'tag' starts at index 5
        let attrs = a.attributes(at: 5, effectiveRange: nil)
        XCTAssertEqual(attrs[.foregroundColor] as? NSColor, typo.tagPurple)
    }

    func testInlineCodeUsesMonoAndBackground() {
        let text = "see `code` thx"
        let a = MarkdownStyler.style(text, activeRange: nil, typography: typo)
        let attrs = a.attributes(at: 5, effectiveRange: nil) // 'c'
        XCTAssertEqual(attrs[.font] as? NSFont, typo.mono)
        XCTAssertNotNil(attrs[.backgroundColor])
    }
}
```

- [ ] **Step 2:** Fail.

`xcodegen && xcodebuild ... test 2>&1 | tail -10` → `Cannot find 'MarkdownStyler' in scope`.

- [ ] **Step 3:** Implement.

Create `Sources/Margin/Editor/MarkdownStyler.swift`:

```swift
import Foundation
import AppKit
import Markdown

enum MarkdownStyler {
    /// Build an NSAttributedString styling `text`. If `activeRange` is non-nil, syntax markers
    /// inside it remain visible (primaryText color); markers outside become hidden (clear).
    static func style(_ text: String,
                      activeRange: NSRange?,
                      typography typo: Typography) -> NSAttributedString {
        let m = NSMutableAttributedString(string: text)
        let full = NSRange(location: 0, length: (text as NSString).length)

        // Defaults: body font, primary color, paragraph metrics.
        m.addAttribute(.font, value: typo.body, range: full)
        m.addAttribute(.foregroundColor, value: typo.primaryText, range: full)

        // Parse the markdown AST.
        let doc = Document(parsing: text, options: [.parseBlockDirectives])
        applyBlockStyles(doc, in: m, text: text, typo: typo, activeRange: activeRange)
        applyInlineRegexPasses(in: m, text: text, typo: typo, activeRange: activeRange)
        return m
    }

    // MARK: - Block traversal

    private static func applyBlockStyles(_ doc: Document,
                                         in m: NSMutableAttributedString,
                                         text: String,
                                         typo: Typography,
                                         activeRange: NSRange?) {
        for child in doc.children {
            visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
        }
    }

    private static func visit(_ markup: Markup,
                              m: NSMutableAttributedString,
                              text: String,
                              typo: Typography,
                              activeRange: NSRange?) {
        switch markup {
        case let h as Heading:
            applyHeading(h, m: m, text: text, typo: typo, activeRange: activeRange)
        case let q as BlockQuote:
            applyQuote(q, m: m, text: text, typo: typo)
            for c in q.children { visit(c, m: m, text: text, typo: typo, activeRange: activeRange) }
        case let cb as CodeBlock:
            applyCodeBlock(cb, m: m, text: text, typo: typo)
        case let p as Paragraph:
            applyInlines(in: p, m: m, text: text, typo: typo, activeRange: activeRange)
        default:
            // Recurse into other containers (lists, etc.); inline-only styling will catch them.
            for c in markup.children {
                visit(c, m: m, text: text, typo: typo, activeRange: activeRange)
            }
        }
    }

    private static func applyHeading(_ h: Heading,
                                     m: NSMutableAttributedString,
                                     text: String,
                                     typo: Typography,
                                     activeRange: NSRange?) {
        guard let sr = h.range,
              let lineRange = RangeConverter.nsRange(of: sr, in: text) else { return }
        let font = typo.headingFont(level: h.level)
        m.addAttribute(.font, value: font, range: lineRange)

        // Hide the leading "# " (or "## " etc.) when not active.
        let ns = text as NSString
        let hashCount = h.level
        // Pad expected: "###...# " — hashCount chars + 1 space.
        let prefixLength = hashCount + 1
        let prefixRange = NSRange(location: lineRange.location,
                                  length: min(prefixLength, lineRange.length))
        let color = isFullyInside(prefixRange, of: activeRange) ? typo.primaryText : typo.hiddenSyntax
        m.addAttribute(.foregroundColor, value: color, range: prefixRange)

        // Visit inlines inside the heading for bold/italic/etc.
        for child in h.children {
            visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
        }
        _ = ns
    }

    private static func applyQuote(_ q: BlockQuote,
                                   m: NSMutableAttributedString,
                                   text: String,
                                   typo: Typography) {
        guard let sr = q.range,
              let r = RangeConverter.nsRange(of: sr, in: text) else { return }
        m.addAttribute(.foregroundColor, value: typo.secondaryText, range: r)
    }

    private static func applyCodeBlock(_ cb: CodeBlock,
                                       m: NSMutableAttributedString,
                                       text: String,
                                       typo: Typography) {
        guard let sr = cb.range,
              let r = RangeConverter.nsRange(of: sr, in: text) else { return }
        m.addAttribute(.font, value: typo.mono, range: r)
        m.addAttribute(.backgroundColor, value: typo.codeBackground, range: r)
    }

    private static func applyInlines(in paragraph: Paragraph,
                                     m: NSMutableAttributedString,
                                     text: String,
                                     typo: Typography,
                                     activeRange: NSRange?) {
        for child in paragraph.children {
            visit(child, m: m, text: text, typo: typo, activeRange: activeRange)
        }
        for inline in paragraph.inlineChildren {
            switch inline {
            case let s as Strong:
                if let sr = s.range,
                   let r = RangeConverter.nsRange(of: sr, in: text) {
                    m.addAttribute(.font, value: typo.bodyBold, range: r)
                    hideMarkers(in: r, of: m, count: 2, typo: typo, activeRange: activeRange)
                }
            case let e as Emphasis:
                if let sr = e.range,
                   let r = RangeConverter.nsRange(of: sr, in: text) {
                    m.addAttribute(.font, value: typo.bodyItalic, range: r)
                    hideMarkers(in: r, of: m, count: 1, typo: typo, activeRange: activeRange)
                }
            case let ic as InlineCode:
                if let sr = ic.range,
                   let r = RangeConverter.nsRange(of: sr, in: text) {
                    m.addAttribute(.font, value: typo.mono, range: r)
                    m.addAttribute(.backgroundColor, value: typo.codeBackground, range: r)
                    hideMarkers(in: r, of: m, count: 1, typo: typo, activeRange: activeRange)
                }
            case let l as Markdown.Link:
                if let sr = l.range,
                   let r = RangeConverter.nsRange(of: sr, in: text) {
                    m.addAttribute(.foregroundColor, value: typo.linkBlue, range: r)
                }
            default:
                break
            }
        }
    }

    /// Hide `count` characters at the start and end of `r` (the syntax delimiters like ** or *)
    /// when they fall outside the active range.
    private static func hideMarkers(in r: NSRange,
                                    of m: NSMutableAttributedString,
                                    count: Int,
                                    typo: Typography,
                                    activeRange: NSRange?) {
        guard r.length >= count * 2 else { return }
        let leading = NSRange(location: r.location, length: count)
        let trailing = NSRange(location: r.location + r.length - count, length: count)
        let leadingColor = isFullyInside(leading, of: activeRange) ? typo.primaryText : typo.hiddenSyntax
        let trailingColor = isFullyInside(trailing, of: activeRange) ? typo.primaryText : typo.hiddenSyntax
        m.addAttribute(.foregroundColor, value: leadingColor, range: leading)
        m.addAttribute(.foregroundColor, value: trailingColor, range: trailing)
    }

    private static func isFullyInside(_ inner: NSRange, of outer: NSRange?) -> Bool {
        guard let outer else { return false }
        return inner.location >= outer.location &&
               (inner.location + inner.length) <= (outer.location + outer.length)
    }

    // MARK: - Inline regex passes (wiki links + inline tags)

    private static let wikiLinkRegex = try! NSRegularExpression(
        pattern: #"\[\[([^\[\]\n]+?)\]\]"#
    )
    private static let inlineTagRegex = try! NSRegularExpression(
        pattern: #"(?<![\w/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)"#
    )

    private static func applyInlineRegexPasses(in m: NSMutableAttributedString,
                                               text: String,
                                               typo: Typography,
                                               activeRange: NSRange?) {
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)

        wikiLinkRegex.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let mr = match else { return }
            let outer = mr.range
            m.addAttribute(.foregroundColor, value: typo.linkBlue, range: outer)
            // Hide [[ and ]] when outside active range.
            if outer.length >= 4 {
                let lead = NSRange(location: outer.location, length: 2)
                let trail = NSRange(location: outer.location + outer.length - 2, length: 2)
                let leadColor = isFullyInside(lead, of: activeRange) ? typo.linkBlue : typo.hiddenSyntax
                let trailColor = isFullyInside(trail, of: activeRange) ? typo.linkBlue : typo.hiddenSyntax
                m.addAttribute(.foregroundColor, value: leadColor, range: lead)
                m.addAttribute(.foregroundColor, value: trailColor, range: trail)
            }
        }

        inlineTagRegex.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let mr = match else { return }
            let outer = mr.range
            // Color the WHOLE tag (including the '#') purple when active; only the slug when not.
            let hashRange = NSRange(location: outer.location, length: 1)
            let slugRange = NSRange(location: outer.location + 1, length: outer.length - 1)
            m.addAttribute(.foregroundColor, value: typo.tagPurple, range: slugRange)
            let hashColor = isFullyInside(hashRange, of: activeRange) ? typo.tagPurple : typo.hiddenSyntax
            m.addAttribute(.foregroundColor, value: hashColor, range: hashRange)
        }
    }
}
```

- [ ] **Step 4:** Tests pass (57 total = 49 + 8 new).

`xcodegen && xcodebuild ... test 2>&1 | grep "Executed"` → 57.

If `testWikiLinkRunIsBlue` fails because the inline `[[A]]` is being parsed by swift-markdown as a standard `Markdown.Link` with empty destination (not unusual for double brackets — swift-markdown may treat `[A]` as a reference and `[[A]]` as an unresolved reference): the regex post-pass should still color it blue, overriding any earlier attribute. If a test fails, check actual attribute at position 6.

If `testHeadingMarkerVisibleWhenActive` fails: the `isFullyInside` check needs to allow ranges that exactly span the active range. Verify the inequality (`<=` not `<`) is correct on both ends.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/MarkdownStyler.swift Tests/MarginTests/MarkdownStylerTests.swift
git commit -m "feat(editor): MarkdownStyler with AST + regex inline rendering"
```

---

## Task 6: Wire MarkdownStyler into EditorView

**Files:** Modify `Sources/Margin/UI/EditorView.swift`.

The current `PlainTextEditor` sets a plain font on the entire NSTextView. We replace its `updateNSView` to apply a styled `NSAttributedString` and re-style on selection changes.

- [ ] **Step 1:** Replace `PlainTextEditor` with `MarkdownEditor`.

Replace the entire `PlainTextEditor` struct (and its Coordinator) with:

```swift
private struct MarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    let onChange: () -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let tv = scroll.documentView as? NSTextView else { return scroll }
        tv.delegate = context.coordinator
        tv.isAutomaticQuoteSubstitutionEnabled = false
        tv.isAutomaticDashSubstitutionEnabled = false
        tv.isAutomaticTextReplacementEnabled = false
        tv.isAutomaticSpellingCorrectionEnabled = false
        tv.isRichText = true                  // we now use NSAttributedString
        tv.usesRuler = false
        tv.usesInspectorBar = false
        tv.allowsUndo = true
        tv.textContainerInset = NSSize(width: 48, height: 32)
        tv.backgroundColor = .textBackgroundColor
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        context.coordinator.restyle(tv: tv, text: text)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: MarkdownEditor
        let typo = Typography.current()
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        func restyle(tv: NSTextView, text: String) {
            // Avoid restyle if the text already matches (otherwise we lose selection).
            if tv.string == text {
                applyAttributes(tv: tv)
                return
            }
            suppressDelegate = true
            let savedSelection = tv.selectedRange()
            let styled = makeAttributed(text: text, activeRange: savedSelection.location.isFinite
                ? NSRange(location: savedSelection.location, length: 0) : nil)
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(savedSelection)
            suppressDelegate = false
        }

        func applyAttributes(tv: NSTextView) {
            let selection = tv.selectedRange()
            let active = ActiveParagraph.range(in: tv.string, cursor: selection.location)
            let styled = makeAttributed(text: tv.string, activeRange: active)
            let savedSelection = tv.selectedRange()
            suppressDelegate = true
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(savedSelection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, activeRange: NSRange?) -> NSAttributedString {
            // activeRange here is just the cursor location range; expand to paragraph
            let activeParagraph: NSRange?
            if let r = activeRange {
                activeParagraph = ActiveParagraph.range(in: text, cursor: r.location)
            } else {
                activeParagraph = nil
            }
            return MarkdownStyler.style(text, activeRange: activeParagraph, typography: typo)
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            parent.text = tv.string
            parent.onChange()
            // Re-style on every change. For large documents this is wasteful; M7 should throttle.
            applyAttributes(tv: tv)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !suppressDelegate, let tv = notification.object as? NSTextView else { return }
            applyAttributes(tv: tv)
        }
    }
}
```

- [ ] **Step 2:** Update `EditorView.body` to reference `MarkdownEditor`.

Find:
```swift
                    PlainTextEditor(text: $state.noteBody, onChange: {
                        state.bodyChanged()
                    })
```

Replace with:
```swift
                    MarkdownEditor(text: $state.noteBody, onChange: {
                        state.bodyChanged()
                    })
```

- [ ] **Step 3:** Build + tests.

```bash
xcodegen && xcodebuild ... build 2>&1 | tail -5
xcodebuild ... test 2>&1 | grep "Executed"
```

Build SUCCEEDED. 57 tests pass.

Possible issue: `suppressDelegate = true` then `setAttributedString` may still trigger textDidChange. If you see selection jumping or infinite loops, the `suppressDelegate` flag may need to be checked more carefully — verify it's read at the top of both `textDidChange` and `textViewDidChangeSelection`.

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/UI/EditorView.swift
git commit -m "feat(ui): MarkdownEditor with AST-driven inline styling"
```

---

## Task 7: M3 verification + tag

**Files:** Create `docs/M3-verification.md`.

- [ ] **Step 1:** Build the final .app.

```bash
cd /Users/jianjustin/workspaces/margin
xcodebuild -scheme Margin -configuration Debug -derivedDataPath build/ -destination "platform=macOS" build 2>&1 | tail -3
```

Expect BUILD SUCCEEDED.

- [ ] **Step 2:** Run all tests one more time.

```bash
xcodebuild -scheme Margin -destination "platform=macOS" test 2>&1 | grep -E "Executed|TEST"
```

Expect 57 tests, 0 failures.

- [ ] **Step 3:** Write the checklist.

Create `/Users/jianjustin/workspaces/margin/docs/M3-verification.md`:

```markdown
# M3 手动验收

日期：2026-05-30
验收人：<待填>

- [ ] 打开 vault 中含标题的笔记：H1/H2/H3 字号呈现差异
- [ ] 段落中包含 `**粗体**`：光标不在该段落时仅显示"粗体"二字（粗体样式），`**` 标记不可见
- [ ] 段落中包含 `*斜体*`：光标移开后 `*` 隐藏，"斜体"以斜体显示
- [ ] 段落中包含 `[[wiki link]]`：未激活时仅显示"wiki link"（蓝色）；激活时 `[[ ]]` 也显示蓝色
- [ ] 段落中包含 `#tag`：未激活时仅显示 "tag"（紫色）；激活时 `#` 也显示紫色
- [ ] 段落中包含 `` `code` ``：等宽字体 + 浅灰背景，未激活时反引号隐藏
- [ ] 把光标移到一行 → 该行的全部 markdown 语法字符变可见（primary color）
- [ ] 把光标移到空行 → 之前的活动段落语法变回隐藏
- [ ] 输入大量笔记时编辑器响应仍流畅（每次按键 < 50ms）— 大笔记会有卡顿，记录于已知限制

## 启动

```bash
open /Users/jianjustin/workspaces/margin/build/Build/Products/Debug/Margin.app
```
```

## 已知限制

- 隐藏语法字符仍占用水平空间（前景色 = clear，非真正 zero-advance；M7 polish）
- 渲染策略是"全文 restyle"，超长笔记键入可能掉帧（M7 增加 throttle / 增量 restyle）
- 图片 `![alt](path)` 暂未行内显示（M7）
- 代码块语法高亮缺席（M7+）

## 问题 / 备注

-
```

- [ ] **Step 4:** Commit doc + tag.

```bash
git add docs/M3-verification.md
git commit -m "docs: M3 verification checklist"
git tag -a v0.3.0-m3 -m "M3: Bear-style inline Markdown rendering"
git log --oneline | head -15
git tag --list
```

---

## Out of Scope (M4+ owns)

- Wiki link autocomplete popover (M4)
- Backlinks panel inside editor (M4)
- Real wiki-link click → navigation (M4)
- Tag tree sidebar (M5)
- Cmd-K command palette (M6)
- Typography polish, image rendering, real zero-advance hidden syntax, render throttling (M7)

---

## Self-Review

- **Spec coverage**: §4.2 (inline rendering rules — headings, bold, italic, code, code block, wiki link, image deferred, lists/quotes partial, inline tag), §4.3 (typography colors + sizes), §4.4 (input handling deferred to M4).
- **Placeholders**: none. Every code block is complete and committable.
- **Type consistency**: `Typography.body/bodyBold/h1..h4/primaryText/.../hiddenSyntax`, `MarkdownStyler.style(_:activeRange:typography:)`, `RangeConverter.nsRange(of:in:)`, `ActiveParagraph.range(in:cursor:)`, `MarkdownEditor` are referenced consistently.
- **Risks**:
  - `swift-markdown` AST may parse `[[wikilink]]` in unexpected ways; the regex post-pass insulates us, but watch for tests that check inner attributes.
  - Re-styling on every keystroke is the obvious perf problem; flagged for M7.
  - `bodyBold` / `bodyItalic` constructed from `NSFontManager.shared.convert(...)` returns a fallback if SF Pro is unavailable. If the test machine's SF Pro descriptor query fails, fonts may not be the literal expected instances and the equality assertions in MarkdownStylerTests will need to be looser (compare by trait, not by `===`). If implementer hits this, switch tests to verify `font.fontDescriptor.symbolicTraits.contains(.bold)` etc., and document.
