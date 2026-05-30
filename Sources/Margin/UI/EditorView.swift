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
                VStack(spacing: 0) {
                    EditorToolbar()
                    MarkdownEditor(text: $state.noteBody,
                                   onChange: { state.bodyChanged() })
                    .background(Color(theme.palette.bg))
                }
            }
        }
    }
}

private struct EditorToolbar: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        HStack(spacing: 8) {
            if let url = state.selectedNoteURL {
                Text(url.deletingPathExtension().lastPathComponent)
                    .font(.headline)
                    .foregroundStyle(Color(theme.palette.text))
            }
            if state.dirty {
                Circle()
                    .fill(Color(theme.palette.accent))
                    .frame(width: 8, height: 8)
                    .help("Unsaved changes")
            }
            Spacer()
            Button(action: { theme.toggleMode() }) {
                Image(systemName: theme.mode == .dark ? "sun.max" : "moon")
                    .foregroundStyle(Color(theme.palette.textDim))
            }
            .buttonStyle(.plain)
            .help("Toggle theme")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(theme.palette.bgPanel))
        .overlay(Divider().background(Color(theme.palette.borderSoft)),
                 alignment: .bottom)
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
        tv.selectedTextAttributes = [
            .backgroundColor: theme.palette.selection
        ]
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
            } else {
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
