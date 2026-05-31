# Margin M3.8 (Block-Level Editor Chrome — Minimal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the editor's NSTextView to TextKit 2 and introduce two custom `NSTextLayoutFragment` subclasses that paint block-level chrome around quote and code blocks: a 3pt rounded gold bar on the left of every quote line, and a rounded-corner panel + 1pt border around every code block. Add hover detection that paints a ⠿ drag handle 30pt to the left of any paragraph the mouse passes over (visual only — no drag, no interactivity). Trim the now-redundant character-level styling from `MarkdownStyler` so chrome is owned by exactly one layer.

**Architecture:**
- The editor switches from TextKit 1 (`NSTextView.scrollableTextView()`) to a TextKit 2 stack: explicit `NSTextContentStorage` → `NSTextLayoutManager` → `NSTextContainer` → `NSTextView(frame:textContainer:)`. The same `NSScrollView` wraps it.
- A new `BlockKindIndex` value type, computed from the markdown source by `swift-markdown`, maps each `NSRange` to a `BlockKind` (`.paragraph | .heading | .quote | .code | .other`). It is pure and TDD-covered.
- A new `BlockChromeDelegate: NSObject, NSTextLayoutManagerDelegate` consults the index on every fragment request and returns either a stock `NSTextLayoutFragment` or one of two custom subclasses (`QuoteBlockFragment`, `CodeBlockFragment`). The delegate is owned by the editor's `Coordinator`.
- `MarkdownEditorTextView: NSTextView` adds a single `NSTrackingArea(.activeInActiveApp | .mouseMoved | .inVisibleRect)`. `mouseMoved` resolves the cursor's point to the enclosing `NSTextLayoutFragment.id` and stores it on the coordinator's `hoveredFragmentID`. The fragment subclasses query that ID to decide whether to paint the ⠿ handle.
- `MarkdownStyler` stops paying `.backgroundColor` on code-block ranges and stops dyeing the leading `>` characters of quote lines — both jobs migrate to the fragments. Inline rendering, headings, links, tags, bold/italic continue to flow through `MarkdownStyler`.

**Tech Stack:** Swift 5.10, AppKit `NSTextView` + TextKit 2 (`NSTextContentStorage`, `NSTextLayoutManager`, `NSTextLayoutFragment`, `NSTextLayoutFragmentLayoutContext`), swift-markdown (existing dep), XCTest.

**Spec:** [`2026-05-30-margin-editor-redesign.md`](../specs/2026-05-30-margin-editor-redesign.md) §6.

**Repo location:** `/Users/jianjustin/workspaces/margin`. Baseline at start of M3.8: `99358e5`.

**Scope notes (explicit cuts from spec §6):**
- **No `DividerBlockFragment`.** Dividers keep their M3 styler treatment (paragraph styled as a horizontal rule via attribute string). Fragment-based divider visual is M3.8.1 backlog.
- **No interactive code header (`NSTextAttachmentViewProvider` with language picker + copy button).** Code blocks render a plain text language label drawn inside the fragment's own header area instead of an embedded `NSHostingView`. Interactivity moves to M3.8.2.
- **No syntax highlighting.** Inline `Splash` / `tree-sitter` integration stays on the M7 polish backlog. Code body is rendered in `Typography.mono` with the existing styler color.
- **Drag handle is visual only.** Cursor does not change shape; clicking does nothing. Drag reorder is M8.
- **Performance:** the block index is recomputed on every text mutation (same cadence as `MarkdownStyler.style(_:activeRange:typography:)`). For typical < 10k char notes the swift-markdown re-parse is ≤ 5 ms. Incremental re-indexing is M7 polish.

**Risk acknowledgement:** TextKit 2 fragment subclassing is the deepest AppKit surface in this codebase. Two failure modes are anticipated:
1. The fragment's `layoutFragmentFrame` and `renderingSurfaceBounds` math is wrong → text clips, baselines drift, or hover-handle paints in the wrong column. Mitigation: T1 ships a no-op TextKit 2 stack first; T3/T4 introduce subclasses one at a time with manual verification between each.
2. `NSTextView(usingTextLayoutManager: true)` may behave differently from a manually-assembled stack on macOS 14. T1 builds the stack manually to keep us in control.

---

## File Structure (after M3.8 complete)

```
margin/
├── Sources/Margin/
│   ├── Editor/
│   │   ├── BlockKindIndex.swift              # NEW: AST → [BlockKind] map by NSRange
│   │   ├── BlockChromeDelegate.swift         # NEW: NSTextLayoutManagerDelegate
│   │   ├── QuoteBlockFragment.swift          # NEW: NSTextLayoutFragment subclass
│   │   ├── CodeBlockFragment.swift           # NEW: NSTextLayoutFragment subclass
│   │   ├── MarkdownEditorTextView.swift      # NEW: NSTextView subclass with hover tracking
│   │   └── MarkdownStyler.swift              # MODIFY: drop `>` dye + code bg attribute
│   └── UI/
│       └── EditorView.swift                  # MODIFY: TextKit 2 construction; wire delegate
└── Tests/MarginTests/
    └── BlockKindIndexTests.swift             # NEW
```

---

## Conventions

- Run commands from `/Users/jianjustin/workspaces/margin`. Run `xcodegen` after creating Swift files.
- Tests use XCTest. The only TDD module in M3.8 is `BlockKindIndex` (pure). Fragment subclasses are exercised by the M3.8 verification checklist (manual).
- Commit at the end of each task.
- Whenever a task touches `MarkdownStyler` or `EditorView`, run the full suite before committing.

---

## Task 1: Switch editor to a TextKit 2 stack (no behavior change)

**Files:** Modify `Sources/Margin/UI/EditorView.swift`.

Replace the `NSTextView.scrollableTextView()` factory call with a manually assembled TextKit 2 stack: `NSTextContentStorage → NSTextLayoutManager → NSTextContainer → NSTextView(frame:textContainer:)`. Wrap in `NSScrollView` ourselves. Everything else (`textContainerInset`, `backgroundColor`, `insertionPointColor`, `delegate`, etc.) stays. After this task the app must look and behave identically to before — M3.5+M3.6+M3.7 verifications still pass.

- [ ] **Step 1:** Read the current `Sources/Margin/UI/EditorView.swift`. Locate `makeNSView(context:)`. The first lines are:

```swift
let scroll = NSTextView.scrollableTextView()
guard let tv = scroll.documentView as? NSTextView else { return scroll }
```

Replace those two lines with:

```swift
let scroll = NSScrollView()
scroll.hasVerticalScroller = true
scroll.drawsBackground = false
let contentStorage = NSTextContentStorage()
let layoutManager = NSTextLayoutManager()
let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
container.widthTracksTextView = true
layoutManager.textContainer = container
contentStorage.addTextLayoutManager(layoutManager)
let tv = NSTextView(frame: .zero, textContainer: container)
tv.minSize = CGSize(width: 0, height: 0)
tv.maxSize = CGSize(width: CGFloat.greatestFiniteMagnitude,
                    height: CGFloat.greatestFiniteMagnitude)
tv.isVerticallyResizable = true
tv.isHorizontallyResizable = false
tv.autoresizingMask = [.width]
scroll.documentView = tv
```

The block of `tv.delegate = …` / IME flags / `textContainerInset` / `backgroundColor` / coordinator.typography assignment that already follows stays exactly the same.

- [ ] **Step 2:** Build.

Run: `xcodegen >/dev/null && xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`. If any error mentions `NSTextContentStorage`, `NSTextLayoutManager`, or `NSTextContainer`, you may need to add `import AppKit` (already present).

- [ ] **Step 3:** Run the full suite.

Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 93 tests pass.

- [ ] **Step 4:** Smoke-test by launching the app:

```bash
xcodebuild -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -configuration Debug build 2>&1 | tail -3
# Verify the .app was produced under DerivedData; do not auto-launch.
```

Report whether the build artifact was produced. The user will manually verify the visible behavior at the M3.8 verification checkpoint (Task 7).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/UI/EditorView.swift
git commit -m "refactor(editor): assemble explicit TextKit 2 stack (no behavior change)"
```

---

## Task 2: `BlockKindIndex` — pure AST → range map + tests

**Files:**
- Create: `Sources/Margin/Editor/BlockKindIndex.swift`
- Create: `Tests/MarginTests/BlockKindIndexTests.swift`

Define a `BlockKind` enum and a pure `BlockKindIndex` value type that, given the markdown source string, exposes `kind(at: NSRange) -> BlockKind` and `ranges(of: BlockKind) -> [NSRange]`. Built via `swift-markdown`'s `Document(parsing:)`, walking only top-level children. Used by the chrome delegate to decide which fragment subclass to return.

- [ ] **Step 1:** Write the failing tests. Create `Tests/MarginTests/BlockKindIndexTests.swift`:

```swift
import XCTest
@testable import Margin

final class BlockKindIndexTests: XCTestCase {

    func testParagraphIsParagraph() {
        let idx = BlockKindIndex(text: "hello world\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .paragraph)
    }

    func testHeadingIsHeading() {
        let idx = BlockKindIndex(text: "# Title\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .heading)
    }

    func testQuoteIsQuote() {
        let idx = BlockKindIndex(text: "> a quote\n")
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .quote)
        XCTAssertEqual(idx.kind(atUTF16Offset: 5), .quote)
    }

    func testCodeFenceIsCode() {
        let text = "```\nlet x = 1\n```\n"
        let idx = BlockKindIndex(text: text)
        XCTAssertEqual(idx.kind(atUTF16Offset: 0), .code)
        // Inside the body of the fence
        let inside = (text as NSString).range(of: "let x").location
        XCTAssertEqual(idx.kind(atUTF16Offset: inside), .code)
    }

    func testRangesOfQuote() {
        let text = "p one\n\n> q one\n> q two\n\np two\n"
        let idx = BlockKindIndex(text: text)
        let qs = idx.ranges(of: .quote)
        XCTAssertEqual(qs.count, 1)
        let ns = text as NSString
        let quoteSubstring = ns.substring(with: qs[0])
        XCTAssertTrue(quoteSubstring.contains("q one"))
        XCTAssertTrue(quoteSubstring.contains("q two"))
    }

    func testRangesOfCode() {
        let text = "intro\n\n```\nfoo\n```\n\nouttro\n"
        let idx = BlockKindIndex(text: text)
        let cs = idx.ranges(of: .code)
        XCTAssertEqual(cs.count, 1)
    }

    func testOutOfBoundsIsParagraph() {
        let idx = BlockKindIndex(text: "x")
        XCTAssertEqual(idx.kind(atUTF16Offset: 999), .paragraph)
    }
}
```

- [ ] **Step 2:** Confirm tests fail.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/BlockKindIndexTests -quiet 2>&1 | tail -5`
Expected: `cannot find 'BlockKindIndex'` build error.

- [ ] **Step 3:** Implement `Sources/Margin/Editor/BlockKindIndex.swift`:

```swift
import Foundation
import Markdown

enum BlockKind: Equatable {
    case paragraph
    case heading
    case quote
    case code
    case other
}

/// Pure value-type index: parses Markdown once and exposes O(log n) range
/// queries for each block. UTF-16 offsets to match NSAttributedString /
/// NSTextView world.
struct BlockKindIndex {
    private struct Entry {
        let range: NSRange
        let kind: BlockKind
    }

    private let entries: [Entry]

    init(text: String) {
        let doc = Document(parsing: text)
        var built: [Entry] = []
        for child in doc.children {
            guard let sr = child.range,
                  let r = RangeConverter.nsRange(of: sr, in: text) else { continue }
            built.append(Entry(range: r, kind: BlockKindIndex.classify(child)))
        }
        self.entries = built
    }

    func kind(atUTF16Offset off: Int) -> BlockKind {
        for e in entries {
            if NSLocationInRange(off, e.range) { return e.kind }
        }
        return .paragraph
    }

    func ranges(of kind: BlockKind) -> [NSRange] {
        entries.filter { $0.kind == kind }.map(\.range)
    }

    private static func classify(_ markup: Markup) -> BlockKind {
        switch markup {
        case is Heading:     return .heading
        case is BlockQuote:  return .quote
        case is CodeBlock:   return .code
        case is Paragraph:   return .paragraph
        default:             return .other
        }
    }
}
```

- [ ] **Step 4:** Run tests.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -only-testing:MarginTests/BlockKindIndexTests 2>&1 | grep -E "(Test Suite|passed|failed|error:)" | head -15`
Expected: all 7 tests pass.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/BlockKindIndex.swift Tests/MarginTests/BlockKindIndexTests.swift
git commit -m "feat(editor): BlockKindIndex — pure markdown block-range classifier"
```

---

## Task 3: `QuoteBlockFragment` + `BlockChromeDelegate` (gold left bar)

**Files:**
- Create: `Sources/Margin/Editor/QuoteBlockFragment.swift`
- Create: `Sources/Margin/Editor/BlockChromeDelegate.swift`
- Modify: `Sources/Margin/UI/EditorView.swift` (wire delegate, drop `>` dye expectation later)

`QuoteBlockFragment` subclasses `NSTextLayoutFragment`. It calls `super.draw(at:in:)` for the text, then paints a 3pt-wide rounded gold rectangle along the leading edge of `layoutFragmentFrame`. `BlockChromeDelegate` implements `textLayoutManager(_:textLayoutFragmentFor:in:)` and returns `QuoteBlockFragment` if the location falls inside any of the index's quote ranges; otherwise the default `NSTextLayoutFragment`.

- [ ] **Step 1:** Create `Sources/Margin/Editor/QuoteBlockFragment.swift`:

```swift
import AppKit

/// Paints a 3pt rounded accent-coloured bar along the leading edge of every
/// quote-block layout fragment, in addition to the standard text rendering.
final class QuoteBlockFragment: NSTextLayoutFragment {
    var barColor: NSColor = .systemYellow

    override func draw(at point: CGPoint, in context: CGContext) {
        // 1. Standard text rendering.
        super.draw(at: point, in: context)

        // 2. Decoration.
        let frame = layoutFragmentFrame
        let bar = CGRect(x: point.x + frame.minX,
                         y: point.y + frame.minY + 2,
                         width: 3,
                         height: max(0, frame.height - 4))
        context.saveGState()
        context.setFillColor(barColor.cgColor)
        let path = CGPath(roundedRect: bar,
                          cornerWidth: 1.5, cornerHeight: 1.5,
                          transform: nil)
        context.addPath(path)
        context.fillPath()
        context.restoreGState()
    }
}
```

- [ ] **Step 2:** Create `Sources/Margin/Editor/BlockChromeDelegate.swift`:

```swift
import AppKit

/// NSTextLayoutManagerDelegate that returns a chrome-aware fragment subclass
/// (Quote / Code / default) based on the latest BlockKindIndex.
final class BlockChromeDelegate: NSObject, NSTextLayoutManagerDelegate {

    var index: BlockKindIndex = BlockKindIndex(text: "")
    var palette: Palette = Palette.dark(accent: .warmGold)
    weak var contentStorage: NSTextContentStorage?

    func textLayoutManager(_ textLayoutManager: NSTextLayoutManager,
                           textLayoutFragmentFor location: any NSTextLocation,
                           in textElement: NSTextElement) -> NSTextLayoutFragment {
        let kind = kindAt(location, manager: textLayoutManager)
        switch kind {
        case .quote:
            let frag = QuoteBlockFragment(textElement: textElement,
                                          range: textElement.elementRange)
            frag.barColor = palette.accent
            return frag
        default:
            return NSTextLayoutFragment(textElement: textElement,
                                        range: textElement.elementRange)
        }
    }

    private func kindAt(_ location: any NSTextLocation,
                        manager: NSTextLayoutManager) -> BlockKind {
        guard let storage = contentStorage,
              let start = manager.documentRange.location as? NSTextLocation else {
            return .paragraph
        }
        let offset = storage.offset(from: start, to: location)
        return index.kind(atUTF16Offset: max(0, offset))
    }
}
```

- [ ] **Step 3:** Modify `Sources/Margin/UI/EditorView.swift`:

  a. The `Coordinator` gains two stored properties:

```swift
let blockChrome = BlockChromeDelegate()
var blockIndex = BlockKindIndex(text: "")
```

  b. Inside `makeNSView`, after the existing layoutManager / contentStorage assembly from Task 1, add:

```swift
layoutManager.delegate = context.coordinator.blockChrome
context.coordinator.blockChrome.contentStorage = contentStorage
context.coordinator.blockChrome.palette = theme.palette
```

  c. Inside `updateNSView`, after `context.coordinator.typography = newTypo`, add:

```swift
context.coordinator.blockChrome.palette = theme.palette
```

  d. Inside `Coordinator.makeAttributed(text:cursor:)`, before returning, refresh the index AND push it onto the delegate:

```swift
blockIndex = BlockKindIndex(text: text)
blockChrome.index = blockIndex
```

  After this, every change to the document re-classifies blocks and lets the delegate paint quote chrome on the next layout pass.

  e. After modifying the attributed string in `applyAttributes` / `syncIfNeeded`, invalidate the manager's layout so the new fragments are requested:

```swift
if let manager = (tv.textContainer?.textLayoutManager) {
    manager.invalidateLayout(for: manager.documentRange)
}
```

  Put this immediately after each `tv.textStorage?.setAttributedString(...)` call. There are two such sites in `applyAttributes` and `syncIfNeeded`; add the invalidation to both.

- [ ] **Step 4:** Build + run the full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 100 tests pass (93 + 7 BlockKindIndex).

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/QuoteBlockFragment.swift Sources/Margin/Editor/BlockChromeDelegate.swift Sources/Margin/UI/EditorView.swift
git commit -m "feat(editor): QuoteBlockFragment paints gold left bar via TextKit 2 delegate"
```

---

## Task 4: `CodeBlockFragment` (rounded panel + 1pt border)

**Files:**
- Create: `Sources/Margin/Editor/CodeBlockFragment.swift`
- Modify: `Sources/Margin/Editor/BlockChromeDelegate.swift` (return CodeBlockFragment for `.code` ranges)

`CodeBlockFragment` paints a rounded rectangle behind the text region, with a 1pt stroke. The fragment frame itself stays text-sized; the decoration extends ~6pt to the left/right and the rectangle is drawn behind the text in `super.draw`.

- [ ] **Step 1:** Create `Sources/Margin/Editor/CodeBlockFragment.swift`:

```swift
import AppKit

/// Paints a rounded-corner background panel + 1pt border behind every
/// code-block layout fragment, then draws the text on top.
final class CodeBlockFragment: NSTextLayoutFragment {
    var fillColor: NSColor = NSColor(white: 0.15, alpha: 1)
    var borderColor: NSColor = NSColor(white: 0.3, alpha: 1)
    var horizontalInset: CGFloat = 4   // breathe a little beyond text
    var cornerRadius: CGFloat = 7

    override func draw(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let panel = CGRect(x: point.x + frame.minX - horizontalInset,
                           y: point.y + frame.minY,
                           width: frame.width + horizontalInset * 2,
                           height: frame.height)
        context.saveGState()
        // Background
        context.setFillColor(fillColor.cgColor)
        let bgPath = CGPath(roundedRect: panel,
                            cornerWidth: cornerRadius,
                            cornerHeight: cornerRadius,
                            transform: nil)
        context.addPath(bgPath)
        context.fillPath()
        // 1pt stroke
        context.setStrokeColor(borderColor.cgColor)
        context.setLineWidth(1)
        let strokePath = CGPath(roundedRect: panel.insetBy(dx: 0.5, dy: 0.5),
                                cornerWidth: cornerRadius,
                                cornerHeight: cornerRadius,
                                transform: nil)
        context.addPath(strokePath)
        context.strokePath()
        context.restoreGState()

        // Text on top.
        super.draw(at: point, in: context)
    }
}
```

- [ ] **Step 2:** Modify `BlockChromeDelegate.textLayoutManager(_:textLayoutFragmentFor:in:)`'s switch to handle `.code`:

```swift
switch kind {
case .quote:
    let frag = QuoteBlockFragment(textElement: textElement,
                                  range: textElement.elementRange)
    frag.barColor = palette.accent
    return frag
case .code:
    let frag = CodeBlockFragment(textElement: textElement,
                                 range: textElement.elementRange)
    frag.fillColor = palette.bgElev
    frag.borderColor = palette.borderSoft
    return frag
default:
    return NSTextLayoutFragment(textElement: textElement,
                                range: textElement.elementRange)
}
```

- [ ] **Step 3:** Build + full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 100 tests pass (no new tests).

- [ ] **Step 4:** Commit.

```bash
git add Sources/Margin/Editor/CodeBlockFragment.swift Sources/Margin/Editor/BlockChromeDelegate.swift
git commit -m "feat(editor): CodeBlockFragment paints rounded panel + 1pt border"
```

---

## Task 5: Hover handle (visual only)

**Files:**
- Create: `Sources/Margin/Editor/MarkdownEditorTextView.swift`
- Modify: `Sources/Margin/Editor/QuoteBlockFragment.swift` and `Sources/Margin/Editor/CodeBlockFragment.swift` (paint ⠿ when hovered)
- Modify: `Sources/Margin/UI/EditorView.swift` (use the new NSTextView subclass; expose `hoveredFragmentID` on coordinator)

A `MarkdownEditorTextView: NSTextView` adds a single `NSTrackingArea` covering its bounds, with `.activeInActiveApp | .mouseMoved | .inVisibleRect`. `mouseMoved(with:)` converts the event point to layout-manager space, calls `layoutManager.textLayoutFragment(for:)`, and stores the result's `id` on the coordinator. Each fragment subclass exposes a `var isHovered: Bool` toggled by the coordinator before invalidation; their `draw` methods paint a ⠿ glyph 30pt to the left of `layoutFragmentFrame` when `isHovered == true`.

- [ ] **Step 1:** Create `Sources/Margin/Editor/MarkdownEditorTextView.swift`:

```swift
import AppKit

/// NSTextView subclass that emits hover events to a closure.
/// One NSTrackingArea, replaced on every bounds change.
final class MarkdownEditorTextView: NSTextView {

    /// Called on every mouseMoved with the event's local point in
    /// text-container coordinates. The handler is responsible for
    /// fragment lookup and redraw invalidation.
    var onHoverPoint: ((CGPoint) -> Void)?
    var onHoverExit: (() -> Void)?

    private var trackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = trackingArea { removeTrackingArea(existing) }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.activeInActiveApp, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        let p = convert(event.locationInWindow, from: nil)
        let inText = CGPoint(x: p.x - textContainerInset.width,
                             y: p.y - textContainerInset.height)
        onHoverPoint?(inText)
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        onHoverExit?()
    }
}
```

- [ ] **Step 2:** Modify `QuoteBlockFragment.swift` to add a hover flag and paint the handle:

```swift
final class QuoteBlockFragment: NSTextLayoutFragment {
    var barColor: NSColor = .systemYellow
    var handleColor: NSColor = NSColor.gray
    var isHovered: Bool = false

    override func draw(at point: CGPoint, in context: CGContext) {
        super.draw(at: point, in: context)

        let frame = layoutFragmentFrame

        // Existing gold bar.
        let bar = CGRect(x: point.x + frame.minX,
                         y: point.y + frame.minY + 2,
                         width: 3,
                         height: max(0, frame.height - 4))
        context.saveGState()
        context.setFillColor(barColor.cgColor)
        context.addPath(CGPath(roundedRect: bar,
                               cornerWidth: 1.5, cornerHeight: 1.5,
                               transform: nil))
        context.fillPath()

        if isHovered {
            paintHandle(at: point, in: context)
        }
        context.restoreGState()
    }

    private func paintHandle(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let glyph = "⠿" as NSString
        let font = NSFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: handleColor
        ]
        let size = glyph.size(withAttributes: attrs)
        let drawPoint = CGPoint(
            x: point.x + frame.minX - 30,
            y: point.y + frame.minY + (frame.height - size.height) / 2
        )
        glyph.draw(at: drawPoint, withAttributes: attrs)
    }
}
```

- [ ] **Step 3:** Modify `CodeBlockFragment.swift` the same way — add `var isHovered: Bool = false`, `var handleColor: NSColor = .gray`, and a `paintHandle(at:in:)` mirror that draws the same ⠿ 30pt to the left of the panel. (Use the same code as Step 2, only the fragment context differs.)

```swift
final class CodeBlockFragment: NSTextLayoutFragment {
    var fillColor: NSColor = NSColor(white: 0.15, alpha: 1)
    var borderColor: NSColor = NSColor(white: 0.3, alpha: 1)
    var handleColor: NSColor = NSColor.gray
    var isHovered: Bool = false
    var horizontalInset: CGFloat = 4
    var cornerRadius: CGFloat = 7

    override func draw(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let panel = CGRect(x: point.x + frame.minX - horizontalInset,
                           y: point.y + frame.minY,
                           width: frame.width + horizontalInset * 2,
                           height: frame.height)
        context.saveGState()
        context.setFillColor(fillColor.cgColor)
        context.addPath(CGPath(roundedRect: panel,
                               cornerWidth: cornerRadius,
                               cornerHeight: cornerRadius,
                               transform: nil))
        context.fillPath()
        context.setStrokeColor(borderColor.cgColor)
        context.setLineWidth(1)
        context.addPath(CGPath(roundedRect: panel.insetBy(dx: 0.5, dy: 0.5),
                               cornerWidth: cornerRadius,
                               cornerHeight: cornerRadius,
                               transform: nil))
        context.strokePath()
        if isHovered {
            paintHandle(at: point, in: context)
        }
        context.restoreGState()
        super.draw(at: point, in: context)
    }

    private func paintHandle(at point: CGPoint, in context: CGContext) {
        let frame = layoutFragmentFrame
        let glyph = "⠿" as NSString
        let font = NSFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: handleColor
        ]
        let size = glyph.size(withAttributes: attrs)
        let drawPoint = CGPoint(
            x: point.x + frame.minX - 30,
            y: point.y + frame.minY + (frame.height - size.height) / 2
        )
        glyph.draw(at: drawPoint, withAttributes: attrs)
    }
}
```

- [ ] **Step 4:** Modify `Sources/Margin/UI/EditorView.swift`:

  a. Replace the `NSTextView(frame: .zero, textContainer: container)` with `MarkdownEditorTextView(frame: .zero, textContainer: container)`.

  b. After the existing `scroll.documentView = tv` line, wire the hover callbacks:

```swift
let mdTv = tv as! MarkdownEditorTextView
mdTv.onHoverPoint = { [weak context = context.coordinator] point in
    guard let coord = context else { return }
    coord.updateHover(at: point)
}
mdTv.onHoverExit = { [weak context = context.coordinator] in
    context?.clearHover()
}
```

  c. Add hover state + handler methods to the `Coordinator`:

```swift
private var hoveredFragmentID: NSUUID?

func updateHover(at point: CGPoint) {
    guard let tv = (parent as MarkdownEditor).self as? Any,
          let scroll = (parentScroll),
          let textView = scroll.documentView as? NSTextView,
          let manager = textView.textContainer?.textLayoutManager else { return }
    let fragment = manager.textLayoutFragment(for: point)
    let newID = fragment?.id as NSUUID?
    if newID != hoveredFragmentID {
        // Clear the prior fragment's flag.
        if let prior = hoveredFragmentID,
           let priorFrag = manager.textLayoutFragment(forIdentifier: prior) {
            setHover(false, on: priorFrag)
            manager.invalidateLayout(for: NSTextRange(location: priorFrag.rangeInElement.location))
        }
        hoveredFragmentID = newID
        if let fragment = fragment {
            setHover(true, on: fragment)
            manager.invalidateLayout(for: NSTextRange(location: fragment.rangeInElement.location))
        }
    }
}

func clearHover() {
    guard let id = hoveredFragmentID,
          let manager = currentLayoutManager(),
          let frag = manager.textLayoutFragment(forIdentifier: id) else {
        hoveredFragmentID = nil
        return
    }
    setHover(false, on: frag)
    manager.invalidateLayout(for: NSTextRange(location: frag.rangeInElement.location))
    hoveredFragmentID = nil
}

private func setHover(_ on: Bool, on fragment: NSTextLayoutFragment) {
    if let q = fragment as? QuoteBlockFragment { q.isHovered = on }
    if let c = fragment as? CodeBlockFragment { c.isHovered = on }
}

private func currentLayoutManager() -> NSTextLayoutManager? {
    // Walk back to the active text view via the parent binding's coordinator.
    // Stash the layout manager on first use in makeNSView (see Step 4d).
    return cachedLayoutManager
}

private var cachedLayoutManager: NSTextLayoutManager?
private var parentScroll: NSScrollView?
```

  d. In `makeNSView`, after `scroll.documentView = tv`:

```swift
context.coordinator.cacheReferences(scroll: scroll, manager: layoutManager)
```

  And add to the Coordinator:

```swift
func cacheReferences(scroll: NSScrollView, manager: NSTextLayoutManager) {
    self.parentScroll = scroll
    self.cachedLayoutManager = manager
}
```

  Simplify `updateHover` to use `cachedLayoutManager` directly instead of the bind-walk.

  This wiring is the most fragile step in M3.8. If anything reports BLOCKED with a Swift error around `parent as MarkdownEditor`, fall back to passing `manager` + `scroll` into `updateHover(at:manager:)` directly.

- [ ] **Step 5:** Build + full suite.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 100 tests pass.

- [ ] **Step 6:** Commit.

```bash
git add Sources/Margin/Editor/MarkdownEditorTextView.swift Sources/Margin/Editor/QuoteBlockFragment.swift Sources/Margin/Editor/CodeBlockFragment.swift Sources/Margin/UI/EditorView.swift
git commit -m "feat(editor): hover paints ⠿ drag handle on quote/code fragments"
```

---

## Task 6: `MarkdownStyler` cleanup

**Files:** Modify `Sources/Margin/Editor/MarkdownStyler.swift`.

Two responsibilities migrate from the styler to the fragments:
1. `applyQuote(_:m:text:typo:)` currently paints the leading `>` characters with `typo.quoteBar`. Stop painting that — the fragment owns the visual bar now. Leave the dim foreground color and indent intact.
2. `applyCodeBlock(_:m:text:typo:)` currently sets `.backgroundColor = typo.codeBackground` on the code block range. Stop. The fragment paints the background. Leave the `.font` (mono) untouched.

- [ ] **Step 1:** Read the current `Sources/Margin/Editor/MarkdownStyler.swift`. Find `applyQuote` and remove the inner loop that dyes each line's leading `>` characters with `typo.quoteBar` (the block of code around `let markerLength = (idx + 1 < end && ns.character(at: idx + 1) == 0x20) ? 2 : 1`). Keep the dim `.foregroundColor` on the quote range and the hanging-indent `.paragraphStyle`.

- [ ] **Step 2:** In `applyCodeBlock`, remove the `m.addAttribute(.backgroundColor, value: typo.codeBackground, range: r)` line. Keep the `.font` mono assignment.

- [ ] **Step 3:** Update `MarkdownStylerTests.swift` if any test asserted on those exact attributes:
   - Search for `quoteBar` in the test file: any test asserting `attrs[.foregroundColor] as? NSColor == typo.quoteBar` must be updated to NOT expect `quoteBar` on a `>` character. If the test currently asserts `quoteBar` on the `>` character of a non-active quote line, change the expectation to whatever the surrounding paragraph color is (likely `typo.secondaryText` since the quote body is dimmed). Verify by running the test.
   - Search for `codeBackground` in the test file: any test asserting the code-block `.backgroundColor == typo.codeBackground` should be removed or rewritten to assert the font is mono instead.

- [ ] **Step 4:** Build + full suite. If any test fails, fix the test expectation (per Step 3) rather than reverting the styler.

Run: `xcodegen >/dev/null && xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED|error:)" | tail -5`
Expected: 100 tests pass.

- [ ] **Step 5:** Commit.

```bash
git add Sources/Margin/Editor/MarkdownStyler.swift Tests/MarginTests/MarkdownStylerTests.swift
git commit -m "refactor(editor): MarkdownStyler stops painting > char and code bg — fragments own them"
```

---

## Task 7: Manual smoke verification

**Files:** Create `docs/M3.8-verification.md`.

- [ ] **Step 1:** Write `docs/M3.8-verification.md`:

```markdown
# M3.8 — Block chrome verification

Run `xcodegen && open Margin.xcodeproj`, build & launch, open a note containing at least one quote and one code block.

## Quote
- [ ] Each quote line shows a 3pt rounded warm-gold bar along its left edge
- [ ] No `>` character appears in the rendered output (the marker is hidden by inline rendering AND no longer dyed by the styler)
- [ ] Multi-line quotes carry the bar across all their lines

## Code block
- [ ] The code block sits in a rounded panel (~7pt corner) with a 1pt border-soft stroke
- [ ] The panel extends ~4pt beyond the text on left/right
- [ ] Body text renders in IBM Plex Mono (with system fallback)
- [ ] Theme toggle (sun/moon) repaints the code panel in the light-mode equivalent colors

## Hover handle
- [ ] Moving the mouse over a quote line paints a faint ⠿ glyph ~30pt to the left of the bar
- [ ] Moving the mouse over a code block paints the ⠿ to the left of the panel
- [ ] Moving away clears the handle
- [ ] The handle is purely visual — clicking does nothing, cursor does not change shape

## Regressions
- [ ] Inline `**bold**`, `*italic*`, `[[wiki]]`, `[label](url)`, `#tag`, ` `code` ` still render correctly
- [ ] Active-paragraph behavior still works (raw markers show when caret enters)
- [ ] M3.6 StatusBar block count is still right
- [ ] M3.7 file tree row chrome is unchanged

## Unit tests
Run: `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' -quiet`
- [ ] All tests pass (BlockKindIndex + everything before)
```

- [ ] **Step 2:** Sanity-run automated checks:
   - `xcodebuild test -project Margin.xcodeproj -scheme Margin -destination 'platform=macOS' 2>&1 | grep -E "(MarginTests.xctest|Selected tests|failed|FAILED)" | tail -3` → 100 tests pass.
   - `grep -rn "scrollableTextView" Sources/` → should be empty (TextKit 1 factory eliminated).

- [ ] **Step 3:** Commit.

```bash
git add docs/M3.8-verification.md
git commit -m "docs: M3.8 verification checklist"
```

---

## Self-review checklist

After every task lands, verify:
- **TextKit 2 path is the only path:** no remaining `scrollableTextView()` in Sources.
- **Chrome ownership:** quote bar and code background are painted by fragments, NOT by `MarkdownStyler`.
- **Hover:** ⠿ paints only on hovered fragment; clears on mouse exit.
- **Type consistency:** `BlockKind` / `BlockKindIndex` / `BlockChromeDelegate` / `QuoteBlockFragment` / `CodeBlockFragment` / `MarkdownEditorTextView` names match across tasks.

After M3.8 lands, the redesign visual scope is **complete**. Open items move to functional milestones: M4 (双链), M5 (Tag), M6 (Cmd-K), and later M7 (settings panel / syntax highlighting), M8 (drag reorder), M9 (block library drawer), M10 (slash menu).
