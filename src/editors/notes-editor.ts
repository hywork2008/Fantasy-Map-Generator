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
import { generateWithAi } from "../controllers/ai-generator";
import { confirmationDialog, downloadFile, getFileName, highlightElement, uploadFile } from "../controllers/editors";
import { getNotesEditorState, setNotesEditorState } from "../store/notesEditorState";
import type { WorldNote } from "../types/WorldState";
import { closeDialog, openDialog } from "../ui/dialogs/dialogService";
import { tip } from "../utils/uiHelpers";

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
      availableNotes,
      isPinned
    });

    requestAnimationFrame(() => {
      const notesLegend = document.getElementById("notesLegend")!;
      notesLegend.innerHTML = note!.legend;
      initEditor();
      updateNotesBox(note!);
    });
  } else {
    setNotesEditorState({
      isOpen: true,
      selectedId: "",
      noteName: "",
      availableNotes,
      isPinned
    });

    requestAnimationFrame(() => {
      const notesLegend = document.getElementById("notesLegend")!;
      notesLegend.innerHTML = "No notes added. Click on an element (e.g. label or marker) and add a free text note";
    });
  }

  openDialog("notesEditor", {
    title: "Notes Editor",
    width: viewContext.svgWidth * 0.8,
    height: viewContext.svgHeight * 0.75,
    position: { my: "center", at: "center", of: "svg" },
    close: removeEditor
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
        editor.on("Change", updateLegend);
      }
    });
  }
}

function updateLegend(): void {
  const { selectedId } = getNotesEditorState();
  const note = worldContext.notes.find(note => note.id === selectedId);
  if (!note) return;

  const isTinyEditorActive = tinymce?.activeEditor;
  const notesLegend = document.getElementById("notesLegend");
  note.legend = isTinyEditorActive ? (tinymce?.activeEditor?.getContent() ?? "") : (notesLegend?.innerHTML ?? "");
  updateNotesBox(note);
}

function updateNotesBox(note: WorldNote): void {
  const header = document.getElementById("notesHeader");
  const body = document.getElementById("notesBody");
  if (header) header.innerHTML = note.name;
  if (body) body.innerHTML = note.legend;
}

function changeElement(id: string): void {
  const note = worldContext.notes.find(note => note.id === id);
  if (!note) {
    tip("Note element is not found", true, "error", 4000);
    return;
  }

  setNotesEditorState({ selectedId: id, noteName: note.name });

  const notesLegend = document.getElementById("notesLegend")!;
  notesLegend.innerHTML = note.legend;
  updateNotesBox(note);

  if (tinymce) tinymce.activeEditor?.setContent(note.legend);
}

function changeName(newName: string): void {
  setNotesEditorState({ noteName: newName });
  const { selectedId } = getNotesEditorState();
  const note = worldContext.notes.find(note => note.id === selectedId);
  if (!note) return;
  note.name = newName;
  updateNotesBox(note);
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
  const element = document.getElementById(selectedId);
  if (element) {
    highlightElement(element, 3);
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
    const notesLegend = document.getElementById("notesLegend")!;
    notesLegend.innerHTML = result;
    if (note) {
      note.legend = result;
      updateNotesBox(note);
      if (tinymce) tinymce.activeEditor?.setContent(note.legend);
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
