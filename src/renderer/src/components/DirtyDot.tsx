import { useDocumentStore } from '@/stores/documentStore'

/** Unsaved-changes indicator. A leaf subscriber so it re-renders on each
 *  keystroke without dragging App (and the file tree) along. */
export function DirtyDot(): JSX.Element {
  const dirty = useDocumentStore((s) => s.content !== s.savedContent)
  return (
    <span
      className="text-[color:var(--accent)] transition-opacity"
      style={{ opacity: dirty ? 1 : 0 }}
      aria-hidden
    >
      ●
    </span>
  )
}
