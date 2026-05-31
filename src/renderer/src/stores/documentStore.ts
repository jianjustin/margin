import { create } from 'zustand'

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'

interface DocumentState {
  path: string | null
  content: string
  savedContent: string
  saveStatus: SaveStatus
  isDirty(): boolean
  load(path: string, content: string): void
  setContent(content: string): void
  markSaving(): void
  markSaved(content: string): void
  markError(): void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  path: null,
  content: '',
  savedContent: '',
  saveStatus: 'saved',

  isDirty: () => get().content !== get().savedContent,

  load: (path, content) =>
    set({ path, content, savedContent: content, saveStatus: 'saved' }),

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
  markError: () => set({ saveStatus: 'error' })
}))
