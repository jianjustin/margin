import SwiftUI
import AppKit

struct EditorView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Group {
            if state.selectedNoteURL == nil {
                NoNoteSelectedView()
            } else {
                VStack(spacing: 0) {
                    EditorToolbar()
                    MarkdownEditor(text: $state.noteBody, onChange: {
                        state.bodyChanged()
                    })
                    .background(Color(NSColor.textBackgroundColor))
                }
            }
        }
    }
}

private struct EditorToolbar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack {
            if let url = state.selectedNoteURL {
                Text(url.deletingPathExtension().lastPathComponent)
                    .font(.headline)
            }
            if state.dirty {
                Circle()
                    .fill(.orange)
                    .frame(width: 8, height: 8)
                    .help("Unsaved changes")
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(NSColor.windowBackgroundColor))
        .overlay(Divider(), alignment: .bottom)
    }
}

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
        tv.isRichText = true
        tv.usesRuler = false
        tv.usesInspectorBar = false
        tv.allowsUndo = true
        tv.textContainerInset = NSSize(width: 48, height: 32)
        tv.backgroundColor = .textBackgroundColor
        // Initial empty content; updateNSView will populate.
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let tv = nsView.documentView as? NSTextView else { return }
        context.coordinator.syncIfNeeded(tv: tv, externalText: text)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let parent: MarkdownEditor
        let typo = Typography.current()
        private var suppressDelegate = false

        init(_ parent: MarkdownEditor) { self.parent = parent }

        /// Called when SwiftUI's `text` binding changes externally (e.g., opening a new note).
        /// If the text is different from the NSTextView, replace it; otherwise just re-style.
        func syncIfNeeded(tv: NSTextView, externalText: String) {
            if tv.string != externalText {
                let savedSelection = tv.selectedRange()
                suppressDelegate = true
                let styled = makeAttributed(text: externalText, cursor: 0)
                tv.textStorage?.setAttributedString(styled)
                // After full text replace, clamp selection to within new bounds.
                let clampedLoc = min(savedSelection.location, externalText.utf16.count)
                tv.setSelectedRange(NSRange(location: clampedLoc, length: 0))
                suppressDelegate = false
            } else {
                applyAttributes(tv: tv)
            }
        }

        /// Re-style the current NSTextView's text based on current cursor position.
        func applyAttributes(tv: NSTextView) {
            let selection = tv.selectedRange()
            let cursor = selection.location
            let styled = makeAttributed(text: tv.string, cursor: cursor)
            let savedSelection = selection
            suppressDelegate = true
            tv.textStorage?.setAttributedString(styled)
            tv.setSelectedRange(savedSelection)
            suppressDelegate = false
        }

        private func makeAttributed(text: String, cursor: Int) -> NSAttributedString {
            let active = ActiveParagraph.range(in: text, cursor: cursor)
            // A length-0 active range (cursor on blank line) means "no active paragraph".
            let activeOrNil: NSRange? = active.length > 0 ? active : nil
            return MarkdownStyler.style(text, activeRange: activeOrNil, typography: typo)
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
