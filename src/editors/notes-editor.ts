import tinymce from "tinymce";
import { modules } from "../store/editorState";
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
import type { WorldNote } from "../types/WorldState";
import { closeDialog, openDialog } from "../ui/dialogs/dialogService";
import { ensureEl } from "../utils";
import { tip } from "../utils/uiHelpers";

export function editNotes(id?: string, name?: string): void {
  const notesLegend = ensureEl("notesLegend");
  const notesName = ensureEl<HTMLInputElement>("notesName");
  const notesSelect = ensureEl<HTMLSelectElement>("notesSelect");
  const notesPin = ensureEl("notesPin");

  // update list of objects
  notesSelect.options.length = 0;
  worldContext.notes.forEach(({ id: noteId }) => {
    notesSelect.options.add(new Option(noteId, noteId));
  });

  // update pin notes icon
  const notesArePinned = worldContext.options.pinNotes;
  if (notesArePinned) notesPin.classList.add("pressed");
  else notesPin.classList.remove("pressed");

  // select an object
  if (worldContext.notes.length || id) {
    if (!id) id = worldContext.notes[0].id;
    let note = worldContext.notes.find(note => note.id === id) ?? null;
    if (!note) {
      if (!name) name = id;
      note = { id: id!, name: name!, legend: "" };
      worldContext.notes.push(note);
      notesSelect.options.add(new Option(id, id));
    }

    notesSelect.value = id!;
    notesName.value = note.name;
    notesLegend.innerHTML = note.legend;
    initEditor();
    updateNotesBox(note);
  } else {
    notesName.value = "";
    notesLegend.innerHTML = "No notes added. Click on an element (e.g. label or marker) and add a free text note";
  }

  openDialog("notesEditor", {
    title: "Notes Editor",
    width: viewContext.svgWidth * 0.8,
    height: viewContext.svgHeight * 0.75,
    position: { my: "center", at: "center", of: "svg" },
    close: removeEditor
  });

  if (modules.editNotes) return;
  modules.editNotes = true;

  // add listeners
  ensureEl("notesSelect").addEventListener("change", changeElement);
  ensureEl("notesName").addEventListener("input", changeName);
  ensureEl("notesLegend").addEventListener("blur", updateLegend);
  ensureEl("notesPin").addEventListener("click", toggleNotesPin);
  ensureEl("notesFocus").addEventListener("click", validateHighlightElement);
  ensureEl("notesGenerateWithAi").addEventListener("click", openAiGenerator);
  ensureEl("notesDownload").addEventListener("click", downloadLegends);
  ensureEl("notesUpload").addEventListener("click", () => (ensureEl("legendsToLoad") as HTMLInputElement).click());
  (ensureEl("legendsToLoad") as HTMLInputElement).addEventListener("change", function (this: HTMLInputElement) {
    uploadFile(this, uploadLegends);
  });
  ensureEl("notesRemove").addEventListener("click", triggerNotesRemove);

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
    const note = worldContext.notes.find(note => note.id === notesSelect.value);
    if (!note) {
      tip("Note element is not found", true, "error", 4000);
      return;
    }

    const isTinyEditorActive = tinymce?.activeEditor;
    note.legend = isTinyEditorActive ? (tinymce?.activeEditor?.getContent() ?? "") : notesLegend.innerHTML;
    updateNotesBox(note);
  }

  function updateNotesBox(note: WorldNote): void {
    ensureEl("notesHeader").innerHTML = note.name;
    ensureEl("notesBody").innerHTML = note.legend;
  }

  function changeElement(this: HTMLSelectElement): void {
    const note = worldContext.notes.find(note => note.id === this.value);
    if (!note) {
      tip("Note element is not found", true, "error", 4000);
      return;
    }

    notesName.value = note.name;
    notesLegend.innerHTML = note.legend;
    updateNotesBox(note);

    if (tinymce) tinymce.activeEditor?.setContent(note.legend);
  }

  function changeName(this: HTMLInputElement): void {
    const note = worldContext.notes.find(note => note.id === notesSelect.value);
    if (!note) {
      tip("Note element is not found", true, "error", 4000);
      return;
    }

    note.name = this.value;
  }

  function removeLegend(): void {
    worldContext.notes = worldContext.notes.filter(({ id: noteId }) => noteId !== notesSelect.value);

    if (!worldContext.notes.length) {
      closeDialog("notesEditor");
      return;
    }

    removeEditor();
    editNotes(worldContext.notes[0].id, worldContext.notes[0].name);
  }

  function validateHighlightElement(): void {
    const element = ensureEl(notesSelect.value);
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
    const note = worldContext.notes.find(note => note.id === notesSelect.value);

    let prompt = `Respond with description. Use simple dry language. Invent facts, names and details. Split to paragraphs and format to HTML. Remove h tags, remove markdown.`;
    if (note?.name) prompt += ` Name: ${note.name}.`;
    if (note?.legend) prompt += ` Data: ${note.legend}`;

    const onApply = (result: string) => {
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
    notesSelect.options.length = 0;
    editNotes(worldContext.notes[0].id, worldContext.notes[0].name);
  }

  function triggerNotesRemove(): void {
    confirmationDialog({
      title: "Remove note",
      message: "Are you sure you want to remove the selected note? There is no way to undo this action",
      confirm: "Remove",
      onConfirm: removeLegend
    });
  }

  function toggleNotesPin(this: HTMLElement): void {
    worldContext.options.pinNotes = !worldContext.options.pinNotes;
    this.classList.toggle("pressed");
  }

  function removeEditor(): void {
    if (tinymce) tinymce.remove();
  }
}
