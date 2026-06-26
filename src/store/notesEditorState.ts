import { create } from "zustand";

export interface NoteItem {
  id: string;
}

export interface NotesEditorState {
  isOpen: boolean;
  selectedId: string;
  noteName: string;
  availableNotes: NoteItem[];
  isPinned: boolean;
}

export const useNotesEditorState = create<NotesEditorState>(() => ({
  isOpen: false,
  selectedId: "",
  noteName: "",
  availableNotes: [],
  isPinned: false
}));

export const getNotesEditorState = useNotesEditorState.getState;
export const setNotesEditorState = useNotesEditorState.setState;
