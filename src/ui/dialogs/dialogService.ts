import type { PromptConfig } from "../../store/dialogState";
import { dialogStore } from "../../store/dialogState";

export type AlertOptions = { title?: string };
export type ConfirmOptions = {
  title?: string;
  confirm?: string;
  cancel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};
export interface RichDialogOptions {
  [key: string]: unknown;
  title?: string;
  content: string;
  buttons?: Array<{ label: string; onClick: () => void; keepOpen?: boolean }> | Record<string, () => void>;
  onOpen?: (container: HTMLElement) => void;
  onClose?: () => void;
}
export type OpenDialogConfig = {
  title?: string;
  onClose?: () => void;
  [key: string]: unknown;
};

// ─ 公開API ────────────────────────────────────────────────────────────────

/** シンプルなalertダイアログ（OKボタンのみ）*/
export function openAlert(message: string, options?: AlertOptions): void {
  dialogStore.getState().setAlertConfig({ id: "__alert__", type: "alert", message, ...options });
}

/** 確認ダイアログ（Yes/No + コールバック）*/
export function openConfirm(message: string, options?: ConfirmOptions): void {
  dialogStore.getState().setAlertConfig({ id: "__alert__", type: "confirm", message, ...options });
}

/** リッチコンテンツダイアログ（HTML埋め込み + DOM参照コールバック）*/
export function openRichDialog(options: RichDialogOptions): void {
  dialogStore.getState().setAlertConfig({ id: "__alert__", type: "rich", ...options });
}

/** プロンプトダイアログ（入力欄付き）*/
export function openPrompt(config: PromptConfig): void {
  dialogStore.getState().setPromptConfig(config);
}

/** ダイアログが開いているか確認する */
export function isDialogOpen(id: string): boolean {
  return dialogStore.getState().openDialogs.has(id);
}

/** 名前付きダイアログを開く */
export function openDialog(id: string, config?: OpenDialogConfig): void {
  dialogStore.getState().openDialog(id, config);
}

/** 名前付きダイアログを閉じる */
export function closeDialog(id: string): void {
  dialogStore.getState().closeDialog(id);
}

/** stable でない全ダイアログを閉じる */
export function closeAllDialogs(except?: string): void {
  dialogStore.getState().closeAllDialogs(except);
}

/**
 * Legacy compatibility wrapper: accepts optional "#id" or "id" prefix.
 * Sub-editors should import this directly from dialogService to avoid circular deps with editors.ts.
 */
export function closeDialogs(except = "#except"): void {
  if (except.includes(".stable")) {
    return; // All React dialogs are considered stable, so do not close them.
  }
  const exceptId = except.startsWith("#") ? except.slice(1) : except;
  closeAllDialogs(exceptId);
}
