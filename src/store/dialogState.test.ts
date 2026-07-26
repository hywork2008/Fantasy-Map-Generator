import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogStore, registerDialogBeforeOpen } from "./dialogState";

afterEach(() => {
  dialogStore.getState().closeAllDialogs();
});

describe("dialogStore close lifecycle", () => {
  it("runs pre-open handlers before a hidden dialog becomes visible", () => {
    const handler = vi.fn(() => {
      expect(dialogStore.getState().openDialogs.has("prepared")).toBe(false);
    });
    const unregister = registerDialogBeforeOpen("prepared", handler);

    dialogStore.getState().openDialog("prepared");
    dialogStore.getState().openDialog("prepared");
    dialogStore.getState().closeDialog("prepared");
    dialogStore.getState().openDialog("prepared");

    expect(handler).toHaveBeenCalledTimes(2);
    unregister();
  });

  it("keeps an after-close hook when dialog content updates its primary close callback", () => {
    const openerCleanup = vi.fn();
    const contentCleanup = vi.fn();

    dialogStore.getState().openDialog("editor", { onAfterClose: openerCleanup });
    dialogStore.getState().openDialog("editor", { onClose: contentCleanup });
    dialogStore.getState().closeDialog("editor");

    expect(contentCleanup).toHaveBeenCalledOnce();
    expect(openerCleanup).toHaveBeenCalledOnce();
  });

  it("runs after-close hooks when closing all dialogs", () => {
    const afterClose = vi.fn();

    dialogStore.getState().openDialog("editor", { onAfterClose: afterClose });
    dialogStore.getState().closeAllDialogs();

    expect(afterClose).toHaveBeenCalledOnce();
  });
});
