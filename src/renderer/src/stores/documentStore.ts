import { create } from 'zustand'

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'

interface DocumentState {
  path: string | null
  content: string
  savedContent: string
  saveStatus: SaveStatus
  /** Remount key for the uncontrolled editor: bumped whenever content is
   *  replaced from outside the editor (open / draft restore / disk reload). */
  epoch: number
  /** Draft found on open, awaiting the user's restore/discard decision. */
  pendingDraft: string | null
  /** Disk content of an external modification awaiting resolution (Task 7). */
  conflict: string | null
  isDirty(): boolean
  load(path: string, content: string): void
  setContent(content: string): void
  markSaving(): void
  markSaved(content: string): void
  markError(): void
  reset(): void
  setPendingDraft(draft: string | null): void
  applyDraft(): void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  path: null,
  content: '',
  savedContent: '',
  saveStatus: 'saved',
  epoch: 0,
  pendingDraft: null,
  conflict: null,

  isDirty: () => get().content !== get().savedContent,

  load: (path, content) =>
    set((state) => ({
      path, content, savedContent: content, saveStatus: 'saved',
      pendingDraft: null, conflict: null, epoch: state.epoch + 1
    })),

  setContent: (content) =>
    set((state) => ({
      content,
      saveStatus: content === state.savedContent ? 'saved' : 'dirty'
    })),

  markSaving: () => set({ saveStatus: 'saving' }),

  markSaved: (content) =>
    set((state) => ({
      savedContent: content,
      saveStatus: state.content === content ? 'saved' : 'dirty'
    })),

  // Leaves savedContent untouched so the document stays dirty and the
  // failed write can be retried.
  markError: () => set({ saveStatus: 'error' }),

  reset: () => set({ path: null, content: '', savedContent: '', saveStatus: 'saved', pendingDraft: null, conflict: null }),

  setPendingDraft: (draft) => set({ pendingDraft: draft }),

  applyDraft: () =>
    set((s) =>
      s.pendingDraft == null
        ? s
        : {
            content: s.pendingDraft,
            saveStatus: s.pendingDraft === s.savedContent ? 'saved' : 'dirty',
            pendingDraft: null,
            epoch: s.epoch + 1
          }
    ),
}))
