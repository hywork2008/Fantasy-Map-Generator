"use strict";

class NotesEditor {
  private notesLegend!: HTMLElement;
  private notesName!: HTMLInputElement;
  private notesSelect!: HTMLSelectElement;
  private notesPin!: HTMLElement;

  public open(id?: string, name?: string) {
    this.notesLegend = ensureEl("notesLegend") as HTMLElement;
    this.notesName = ensureEl("notesName") as HTMLInputElement;
    this.notesSelect = ensureEl("notesSelect") as HTMLSelectElement;
    this.notesPin = ensureEl("notesPin") as HTMLElement;

    this.notesSelect.options.length = 0;
    notes.forEach(({id}) => this.notesSelect.options.add(new Option(id, id)));

    const notesArePinned = options.pinNotes;
    if (notesArePinned) this.notesPin.classList.add("pressed");
    else this.notesPin.classList.remove("pressed");

    if (notes.length || id) {
      if (!id) id = notes[0].id;
      let note = notes.find(note => note.id === id);
      if (!note) {
        if (!name) name = id;
        note = {id, name, legend: ""};
        notes.push(note);
        this.notesSelect.options.add(new Option(id, id));
      }

      this.notesSelect.value = id;
      this.notesName.value = note.name;
      this.notesLegend.innerHTML = note.legend;
      this.initEditor();
      this.updateNotesBox(note);
    } else {
      this.notesName.value = "";
      this.notesLegend.innerHTML = "No notes added. Click on an element (e.g. label or marker) and add a free text note";
    }

    $("#notesEditor").dialog({
      title: "Notes Editor",
      width: svgWidth * 0.8,
      height: svgHeight * 0.75,
      position: {my: "center", at: "center", of: "svg"},
      close: () => this.removeEditor()
    });

    if (modules.editNotes) return;
    modules.editNotes = true;

    ensureEl("notesSelect").addEventListener("change", () => this.changeElement());
    ensureEl("notesName").addEventListener("input", () => this.changeName());
    ensureEl("notesLegend").addEventListener("blur", () => this.updateLegend());
    ensureEl("notesPin").addEventListener("click", () => this.toggleNotesPin());
    ensureEl("notesFocus").addEventListener("click", () => this.validateHighlightElement());
    ensureEl("notesGenerateWithAi").addEventListener("click", () => this.openAiGenerator());
    ensureEl("notesDownload").addEventListener("click", () => this.downloadLegends());
    ensureEl("notesUpload").addEventListener("click", () => legendsToLoad.click());
    ensureEl("legendsToLoad").addEventListener("change", (e: Event) => {
      uploadFile(e.target as HTMLInputElement, (data: string) => this.uploadLegends(data));
    });
    ensureEl("notesRemove").addEventListener("click", () => this.triggerNotesRemove());
  }

  private async initEditor() {
    if (!window.tinymce) {
      const url = "https://azgaar.github.io/Fantasy-Map-Generator/libs/tinymce/tinymce.min.js";
      try {
        await import(/* @vite-ignore */ url);
      } catch (error) {
        try {
          const hash = Math.random().toString(36).substring(2, 15);
          await import(/* @vite-ignore */ `${url}#${hash}`);
        } catch (error) {
          console.error(error);
        }
      }
    }

    if (window.tinymce) {
      window.tinymce._setBaseUrl("https://azgaar.github.io/Fantasy-Map-Generator/libs/tinymce");
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
        setup: (editor: { on: (event: string, callback: () => void) => void }) => {
          editor.on("Change", () => this.updateLegend());
        }
      });
    }
  }

  private updateLegend() {
    const note = notes.find(note => note.id === this.notesSelect.value);
    if (!note) return tip("Note element is not found", true, "error", 4000);

    const isTinyEditorActive = window.tinymce?.activeEditor;
    note.legend = isTinyEditorActive ? tinymce.activeEditor.getContent() : this.notesLegend.innerHTML;
    this.updateNotesBox(note);
  }

  private updateNotesBox(note: {name: string; legend: string}) {
    ensureEl("notesHeader").innerHTML = note.name;
    ensureEl("notesBody").innerHTML = note.legend;
  }

  private changeElement() {
    const note = notes.find(note => note.id === this.notesSelect.value);
    if (!note) return tip("Note element is not found", true, "error", 4000);

    this.notesName.value = note.name;
    this.notesLegend.innerHTML = note.legend;
    this.updateNotesBox(note);

    if (window.tinymce) tinymce.activeEditor.setContent(note.legend);
  }

  private changeName() {
    const note = notes.find(note => note.id === this.notesSelect.value);
    if (!note) return tip("Note element is not found", true, "error", 4000);

    note.name = this.notesName.value;
  }

  private validateHighlightElement() {
    const element = ensureEl(this.notesSelect.value);
    if (element) return highlightElement(element, 3);

    confirmationDialog({
      title: "Element not found",
      message: "Note element is not found. Would you like to remove the note?",
      confirm: "Remove",
      cancel: "Keep",
      onConfirm: () => this.removeLegend()
    });
  }

  private openAiGenerator() {
    const note = notes.find(note => note.id === this.notesSelect.value);

    let prompt = `Respond with description. Use simple dry language. Invent facts, names and details. Split to paragraphs and format to HTML. Remove h tags, remove markdown.`;
    if (note?.name) prompt += ` Name: ${note.name}.`;
    if (note?.legend) prompt += ` Data: ${note.legend}`;

    const onApply = (result: string) => {
      this.notesLegend.innerHTML = result;
      if (note) {
        note.legend = result;
        this.updateNotesBox(note);
        if (window.tinymce) tinymce.activeEditor.setContent(note.legend);
      }
    };

    generateWithAi(prompt, onApply);
  }

  private downloadLegends() {
    const notesData = JSON.stringify(notes);
    const name = getFileName("Notes") + ".txt";
    downloadFile(notesData, name);
  }

  private uploadLegends(dataLoaded: string) {
    if (!dataLoaded) return tip("Cannot load the file. Please check the data format", false, "error");
    notes = JSON.parse(dataLoaded);
    this.notesSelect.options.length = 0;
    editNotes(notes[0].id, notes[0].name);
  }

  private removeLegend() {
    notes = notes.filter(({id}) => id !== this.notesSelect.value);

    if (!notes.length) {
      $("#notesEditor").dialog("close");
      return;
    }

    this.removeEditor();
    editNotes(notes[0].id, notes[0].name);
  }

  private triggerNotesRemove() {
    confirmationDialog({
      title: "Remove note",
      message: "Are you sure you want to remove the selected note? There is no way to undo this action",
      confirm: "Remove",
      onConfirm: () => this.removeLegend()
    });
  }

  private toggleNotesPin() {
    options.pinNotes = !options.pinNotes;
    this.notesPin.classList.toggle("pressed");
  }

  private removeEditor() {
    if (window.tinymce) tinymce.remove();
  }
}

const notesEditor = new NotesEditor();

export function editNotes(id?: string, name?: string) {
  notesEditor.open(id, name);
}
