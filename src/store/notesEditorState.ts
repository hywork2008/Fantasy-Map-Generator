import { create } from "zustand";

export interface NoteItem {
  id: string;
}

export interface NotesEditorState {
  isOpen: boolean;
  selectedId: string;
  noteName: string;
  legend: string;
  availableNotes: NoteItem[];
  isPinned: boolean;
}

export const useNotesEditorState = create<NotesEditorState>(() => ({
  isOpen: false,
  selectedId: "",
  noteName: "",
  legend: "",
  availableNotes: [],
  isPinned: false
}));

export const getNotesEditorState = useNotesEditorState.getState;
export const setNotesEditorState = useNotesEditorState.setState;
