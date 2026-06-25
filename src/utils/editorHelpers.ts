/**
 * Editor utility functions that have no dependency on viewContext or other controllers.
 * These are extracted here so that `editors/` modules can import them
 * without creating a circular dependency through `controllers/editors.ts`.
 */

import { useOptionsState } from "../store/optionsState";
import { openConfirm } from "../ui/dialogs/dialogService";

// ─── File utilities ────────────────────────────────────────────────────────

export function getFileName(dataType?: string): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const name = useOptionsState.getState().mapName;
  const type = dataType ? `${dataType} ` : "";
  const date = new Date();
  const dateString = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("-");
  return `${name} ${type}${dateString}`;
}

export function downloadFile(data: string | Blob, name: string, type = "text/plain"): void {
  const dataBlob = data instanceof Blob ? data : new Blob([data], { type });
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
}

export function uploadFile(el: HTMLInputElement, callback: (data: string) => void): void {
  const fileReader = new FileReader();
  fileReader.readAsText(el.files![0], "UTF-8");
  el.value = "";
  fileReader.onload = loaded => callback((loaded.target as FileReader).result as string);
}

// ─── Confirmation dialog ───────────────────────────────────────────────────

export function confirmationDialog(opts: {
  title?: string;
  message?: string;
  cancel?: string;
  confirm?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
}): void {
  const {
    title = "Confirm action",
    message = "Are you sure you want to continue? <br>The action cannot be reverted",
    cancel = "Cancel",
    confirm = "Continue",
    onCancel,
    onConfirm
  } = opts;

  openConfirm(message, {
    title,
    confirm,
    cancel,
    onConfirm,
    onCancel
  });
}

// ─── Event listener helper ─────────────────────────────────────────────────

export function listen(element: EventTarget, event: string, handler: EventListener): () => void {
  element.addEventListener(event, handler);
  return () => element.removeEventListener(event, handler);
}

// ─── Grid size calculator ─────────────────────────────────────────────────────
