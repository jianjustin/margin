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
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        let contentStorage = NSTextContentStorage()
        let layoutManager = NSTextLayoutManager()
        let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        layoutManager.textContainer = container
        contentStorage.addTextLayoutManager(layoutManager)
        layoutManager.delegate = context.coordinator.blockChrome
        context.coordinator.blockChrome.contentStorage = contentStorage
        context.coordinator.blockChrome.palette = theme.palette
        let tv = MarkdownEditorTextView(frame: .zero, textContainer: container)
        tv.minSize = CGSize(width: 0, height: 0)
        tv.maxSize = CGSize(width: CGFloat.greatestFiniteMagnitude,
                            height: CGFloat.greatestFiniteMagnitude)
        tv.isVerticallyResizable = true
        tv.isHorizontallyResizable = false
        tv.autoresizingMask = [.width]
        scroll.documentView = tv
        context.coordinator.cacheReferences(manager: layoutManager)
        tv.onHoverPoint = { [weak coord = context.coordinator] point in
            coord?.updateHover(at: point)
        }
        tv.onHoverExit = { [weak coord = context.coordinator] in
            coord?.clearHover()
        }
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
            // Accent-only theme changes don't shift body/text/bg but DO shift
            // quoteBar (= palette.accent.alpha(0.55)). Catch them so the
            // block-chrome fragments repaint.
            || context.coordinator.typography.quoteBar != newTypo.quoteBar
        context.coordinator.typography = newTypo
        context.coordinator.blockChrome.palette = theme.palette
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
        let blockChrome = BlockChromeDelegate()
        private weak var cachedLayoutManager: NSTextLayoutManager?
        /// We use ObjectIdentifier (pointer identity) to track which fragment is hovered,
        /// and keep a weak reference to that fragment so we can clear it on exit.
        private weak var hoveredFragment: NSTextLayoutFragment?
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        func syncIfNeeded(tv: NSTextView, externalText: String, forceRestyle: Bool = false) {
            if tv.string != externalText {
                let savedSelection = tv.selectedRange()
                suppressDelegate = true
                let styled = makeAttributed(text: externalText, cursor: 0)
                tv.textStorage?.setAttributedString(styled)
                if let manager = tv.textContainer?.textLayoutManager {
                    manager.invalidateLayout(for: manager.documentRange)
                }
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
            if let manager = tv.textContainer?.textLayoutManager {
                manager.invalidateLayout(for: manager.documentRange)
            }
            tv.setSelectedRange(selection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, cursor: Int) -> NSAttributedString {
            let active = ActiveParagraph.range(in: text, cursor: cursor)
            let activeOrNil: NSRange? = active.length > 0 ? active : nil
            blockChrome.index = BlockKindIndex(text: text)
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

        // MARK: - Hover handling

        func cacheReferences(manager: NSTextLayoutManager) {
            self.cachedLayoutManager = manager
        }

        func updateHover(at point: CGPoint) {
            guard let manager = cachedLayoutManager else { return }
            let fragment = manager.textLayoutFragment(for: point)
            // If the same object is still hovered, nothing to do.
            if fragment === hoveredFragment { return }
            // Clear old hover.
            if let prior = hoveredFragment {
                setHover(false, on: prior)
                manager.invalidateLayout(for: NSTextRange(location: prior.rangeInElement.location))
            }
            hoveredFragment = fragment
            // Set new hover.
            if let fragment = fragment {
                setHover(true, on: fragment)
                manager.invalidateLayout(for: NSTextRange(location: fragment.rangeInElement.location))
            }
        }

        func clearHover() {
            guard let manager = cachedLayoutManager, let frag = hoveredFragment else {
                hoveredFragment = nil
                return
            }
            setHover(false, on: frag)
            manager.invalidateLayout(for: NSTextRange(location: frag.rangeInElement.location))
            hoveredFragment = nil
        }

        private func setHover(_ on: Bool, on fragment: NSTextLayoutFragment) {
            if let q = fragment as? QuoteBlockFragment { q.isHovered = on }
            if let c = fragment as? CodeBlockFragment { c.isHovered = on }
        }
    }
}
