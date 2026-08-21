import { create } from "zustand";

export type ToastType = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  isMain?: boolean;
  mainMessage?: string;
  mainColor?: string;
  expiresAt?: number;
}

export interface HoverTooltip {
  message: string;
  x: number;
  y: number;
  /** The element that owns the tooltip, used to keep it open while moving over its children. */
  target: Element;
}

interface ToastState {
  /** 最新の通知1件のみ保持（重複排除済み） */
  toast: Toast | null;
  hoverTooltip: HoverTooltip | null;
  currentMessage: string;
  addToast: (message: string, type: ToastType, isMain?: boolean, timeMs?: number) => void;
  removeToast: () => void;
  showHoverTooltip: (message: string, x: number, y: number, target: Element) => void;
  hideHoverTooltip: () => void;
  setMainToast: (message: string, color: string) => void;
  clearMainToast: () => void;
  getMainToast: () => { message: string; color: string } | null;
}

let toastCounter = 0;
let timeoutId: NodeJS.Timeout | null = null;

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  hoverTooltip: null,
  currentMessage: "",

  addToast: (message, type, isMain = false, timeMs = 0) => {
    // 空文字列は無視
    if (!message || message.trim() === "") return;

    const state = get();

    // 同じ内容は無視（重複排除）
    if (state.currentMessage === message) return;

    const id = `toast-${++toastCounter}`;
    const toast: Toast = {
      id,
      message,
      type,
      isMain,
      expiresAt: timeMs > 0 ? Date.now() + timeMs : undefined
    };

    // クリアしてから新規追加（最新1件のみ保持）
    if (timeoutId) clearTimeout(timeoutId);

    set({ toast, currentMessage: message });

    // timeMs が 0 の場合は 3000ms で自動消去
    const duration = timeMs > 0 ? timeMs : 3000;
    timeoutId = setTimeout(() => {
      get().removeToast();
    }, duration);
  },

  removeToast: () => {
    set({ toast: null, currentMessage: "" });
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  },

  showHoverTooltip: (message, x, y, target) => {
    if (!message.trim()) return;
    set({ hoverTooltip: { message, x, y, target } });
  },

  hideHoverTooltip: () => {
    set({ hoverTooltip: null });
  },

  setMainToast: (message, color) => {
    set({
      toast: {
        id: `main-toast`,
        message,
        type: "info",
        isMain: true,
        mainMessage: message,
        mainColor: color
      }
    });
  },

  clearMainToast: () => {
    set({ toast: null, currentMessage: "" });
  },

  getMainToast: () => {
    const state = get();
    const toast = state.toast;
    if (toast?.isMain && toast?.mainMessage && toast?.mainColor) {
      return { message: toast.mainMessage, color: toast.mainColor };
    }
    return null;
  }
}));
