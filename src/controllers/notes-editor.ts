import type React from "react";
import tinymce from "tinymce";
import "tinymce/themes/silver";
import "tinymce/plugins/autolink";
import "tinymce/plugins/lists";
import "tinymce/plugins/media";
import "tinymce/plugins/charmap";
import "tinymce/plugins/link";
import "tinymce/plugins/code";
import "tinymce/plugins/table";
import "tinymce/plugins/fullscreen";
import "tinymce/plugins/image";
import "tinymce/plugins/wordcount";
import "tinymce/icons/default/icons";
import "tinymce/models/dom/model";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { setHoverNotesState } from "../store/hoverNotesState";
import { getNotesEditorState, setNotesEditorState } from "../store/notesEditorState";
import type { WorldNote } from "../types/WorldState";
import { closeDialog, openDialog } from "../ui/dialogs/dialogService";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName, uploadFile } from "../utils/editorHelpers";
import { getElementById } from "../utils/nodeUtils";
import { tip } from "../utils/uiHelpers";
import { generateWithAi } from "./ai-generator";

export function editNotes(id?: string, name?: string): void {
  const availableNotes = worldContext.notes.map(({ id: noteId }) => ({ id: noteId }));
  const isPinned = worldContext.options.pinNotes;

  if (worldContext.notes.length || id) {
    if (!id) id = worldContext.notes[0].id;
    let note = worldContext.notes.find(note => note.id === id) ?? null;
    if (!note) {
      if (!name) name = id;
      note = { id: id!, name: name!, legend: "" };
      worldContext.notes.push(note);
      availableNotes.push({ id });
    }

    setNotesEditorState({
      isOpen: true,
      selectedId: id,
      noteName: note.name,
      legend: note.legend,
      availableNotes,
      isPinned
    });

    setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
    requestAnimationFrame(() => {
      initEditor();
    });
  } else {
    setNotesEditorState({
      isOpen: true,
      selectedId: "",
      noteName: "",
      legend: "No notes added. Click on an element (e.g. label or marker) and add a free text note",
      availableNotes,
      isPinned
    });
  }

  openDialog("notesEditor", {
    title: "Notes Editor",
    width: viewContext.svgWidth * 0.8,
    height: viewContext.svgHeight * 0.75,
    position: { my: "center", at: "center", of: "svg" },
    onClose: removeEditor
  });
}

async function initEditor(): Promise<void> {
  if (!tinymce) {
    const url = "https://azgaar.github.io/Fantasy-Map-Generator/libs/tinymce/tinymce.min.js";
    try {
      await import(/* @vite-ignore */ url);
    } catch {
      try {
        const hash = Math.random().toString(36).substring(2, 15);
        await import(/* @vite-ignore */ `${url}#${hash}`);
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (tinymce) {
    tinymce._setBaseUrl("https://azgaar.github.io/Fantasy-Map-Generator/libs/tinymce");
    tinymce.init({
      license_key: "gpl",
      selector: "#notesLegend",
      height: "90%",
      menubar: false,
      plugins: `autolink lists link charmap code fullscreen image link media table wordcount`,
      toolbar: `code | undo redo | removeformat | bold italic strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image media table | fontselect fontsizeselect | blockquote hr charmap | print fullscreen`,
      media_alt_source: false,
      media_poster: false,
      browser_spellcheck: true,
      contextmenu: false,
      setup: (editor: import("tinymce").Editor) => {
        editor.on("Change", () => updateLegend());
      }
    });
  }
}

export function updateLegend(e?: React.FocusEvent<HTMLDivElement> | Event): void {
  const { selectedId } = getNotesEditorState();
  const note = worldContext.notes.find(note => note.id === selectedId);
  if (!note) return;

  const isTinyEditorActive = tinymce?.activeEditor;

  if (isTinyEditorActive) {
    note.legend = tinymce!.activeEditor!.getContent() ?? "";
  } else if (e && "currentTarget" in e && e.currentTarget) {
    // ignore-legacy-dom
    note.legend = (e.currentTarget as HTMLDivElement).innerHTML;
  }

  setNotesEditorState({ legend: note.legend });
  setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
}

function changeElement(id: string): void {
  const note = worldContext.notes.find(note => note.id === id);
  if (!note) {
    tip("Note element is not found", true, "error", 4000);
    return;
  }

  setNotesEditorState({ selectedId: id, noteName: note.name, legend: note.legend });
  setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
}

function changeName(newName: string): void {
  setNotesEditorState({ noteName: newName });
  const { selectedId } = getNotesEditorState();
  const note = worldContext.notes.find(note => note.id === selectedId);
  if (!note) return;
  note.name = newName;
  setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
}

function removeLegend(): void {
  const { selectedId } = getNotesEditorState();
  worldContext.notes = worldContext.notes.filter(({ id: noteId }) => noteId !== selectedId);

  if (!worldContext.notes.length) {
    closeNotesEditor();
    return;
  }

  removeEditor();
  editNotes(worldContext.notes[0].id, worldContext.notes[0].name);
}

function validateHighlightElement(): void {
  const { selectedId } = getNotesEditorState();
  const element = getElementById(selectedId);
  if (element) {
    EditorBus.highlightElement(element, 3);
    return;
  }

  confirmationDialog({
    title: "Element not found",
    message: "Note element is not found. Would you like to remove the note?",
    confirm: "Remove",
    cancel: "Keep",
    onConfirm: removeLegend
  });
}

function openAiGenerator(): void {
  const { selectedId } = getNotesEditorState();
  const note = worldContext.notes.find(note => note.id === selectedId);

  let prompt = `Respond with description. Use simple dry language. Invent facts, names and details. Split to paragraphs and format to HTML. Remove h tags, remove markdown.`;
  if (note?.name) prompt += ` Name: ${note.name}.`;
  if (note?.legend) prompt += ` Data: ${note.legend}`;

  const onApply = (result: string) => {
    if (note) {
      note.legend = result;
      setNotesEditorState({ legend: note.legend });
      setHoverNotesState({ isVisible: true, name: note.name, legend: note.legend });
    }
  };

  generateWithAi(prompt, onApply);
}

function downloadLegends(): void {
  const notesData = JSON.stringify(worldContext.notes);
  const fname = `${getFileName("Notes")}.txt`;
  downloadFile(notesData, fname);
}

function uploadLegends(dataLoaded: string): void {
  if (!dataLoaded) {
    tip("Cannot load the file. Please check the data format", false, "error");
    return;
  }
  worldContext.notes = JSON.parse(dataLoaded) as WorldNote[];
  editNotes(worldContext.notes[0].id, worldContext.notes[0].name);
}

function handleUploadFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  uploadFile(input, uploadLegends);
}

function triggerNotesRemove(): void {
  confirmationDialog({
    title: "Remove note",
    message: "Are you sure you want to remove the selected note? There is no way to undo this action",
    confirm: "Remove",
    onConfirm: removeLegend
  });
}

function toggleNotesPin(): void {
  const isPinned = !worldContext.options.pinNotes;
  worldContext.options.pinNotes = isPinned;
  setNotesEditorState({ isPinned });
}

function removeEditor(): void {
  if (tinymce) tinymce.remove();
}

export function closeNotesEditor(): void {
  removeEditor();
  setNotesEditorState({ isOpen: false });
  closeDialog("notesEditor");
}

export const notesEditorActions = {
  changeElement,
  changeName,
  validateHighlightElement,
  openAiGenerator,
  downloadLegends,
  handleUploadFile,
  triggerNotesRemove,
  toggleNotesPin,
  updateLegend
};
