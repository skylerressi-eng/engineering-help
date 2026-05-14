import { create } from 'zustand';

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'engos.notes.v1';

function load(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Note[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist notes to localStorage. We coalesce calls onto a 400ms debounce so
 * that fast typing doesn't perform a full JSON.stringify+localStorage write
 * on every keystroke.
 */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNotes: Note[] | null = null;

function flushPersist() {
  if (!pendingNotes) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingNotes));
  } catch {
    /* quota */
  }
  pendingNotes = null;
}

function persist(notes: Note[]) {
  pendingNotes = notes;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersist, 400);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPersist);
}

let seq = 1;
const uid = () => `note-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface NotesStore {
  notes: Note[];
  activeId: string | null;

  setActive: (id: string) => void;
  createNote: (title?: string, body?: string) => string;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => void;
  appendToNote: (id: string, body: string) => void;
  deleteNote: (id: string) => void;
}

export const useNotesStore = create<NotesStore>((set) => ({
  notes: load(),
  activeId: null,

  setActive: (id) => set({ activeId: id }),

  createNote: (title = 'Untitled note', body = '') => {
    const id = uid();
    const now = Date.now();
    const note: Note = { id, title, body, createdAt: now, updatedAt: now };
    set((s) => {
      const notes = [note, ...s.notes];
      persist(notes);
      return { notes, activeId: id };
    });
    return id;
  },

  updateNote: (id, patch) =>
    set((s) => {
      const notes = s.notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      );
      persist(notes);
      return { notes };
    }),

  appendToNote: (id, body) =>
    set((s) => {
      const target = s.notes.find((n) => n.id === id);
      if (!target) return s;
      const notes = s.notes.map((n) =>
        n.id === id ? { ...n, body: n.body + body, updatedAt: Date.now() } : n,
      );
      persist(notes);
      return { notes };
    }),

  deleteNote: (id) =>
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      persist(notes);
      return {
        notes,
        activeId: s.activeId === id ? (notes[0]?.id ?? null) : s.activeId,
      };
    }),
}));

// Re-expose direct access for the AI tools which don't run in a React tree
export function getNotesStore() {
  return useNotesStore.getState();
}
