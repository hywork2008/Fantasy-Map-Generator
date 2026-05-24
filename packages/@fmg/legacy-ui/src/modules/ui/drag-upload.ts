import { closeDialogs } from "./editors";
type DragUploadDeps = {
  document: Document;
  ensureEl: (id: string) => HTMLElement;
  alertMessage: HTMLElement;
  closeDialogs?: () => void;
  uploadMap: (file: File, onload: () => void) => void;
  jqueryDialog: (options: {
    resizable: boolean;
    title: string;
    position: { my: string; at: string; of: string };
    buttons: { Close: () => void };
  }) => void;
};

type JqueryDialogHost = {
  dialog: (action: string) => void;
};

const jqueryRuntime = window as Window & {
  $: (target: unknown) => JqueryDialogHost;
};

export function initDragToUpload({ document, ensureEl, alertMessage, closeDialogs, uploadMap, jqueryDialog }: DragUploadDeps) {
  document.addEventListener("dragover", e => {
    e.stopPropagation();
    e.preventDefault();
    ensureEl("mapOverlay").style.display = "";
  });

  document.addEventListener("dragleave", _e => {
    ensureEl("mapOverlay").style.display = "none";
  });

  document.addEventListener("drop", e => {
    e.stopPropagation();
    e.preventDefault();

    const overlay = ensureEl("mapOverlay");
    overlay.style.display = "none";
    if (e.dataTransfer?.items == null || e.dataTransfer.items.length !== 1) return;
    const file = e.dataTransfer.items[0].getAsFile();
    if (!file) return;

    if (!file.name.endsWith(".map") && !file.name.endsWith(".gz")) {
      alertMessage.innerHTML =
        "Please upload a map file (<i>.map</i> or <i>.gz</i> formats) you have previously downloaded";
      jqueryDialog({
        resizable: false,
        title: "Invalid file format",
        position: { my: "center", at: "center", of: "svg" },
        buttons: {
          Close: function () {
            jqueryRuntime.$(this).dialog("close");
          }
        }
      });
      return;
    }

    overlay.style.display = "";
    overlay.innerHTML = "Uploading<span>.</span><span>.</span><span>.</span>";
    closeDialogs && closeDialogs();
    uploadMap(file, () => {
      overlay.style.display = "none";
      overlay.innerHTML = "Drop a map file to open";
    });
  });
}