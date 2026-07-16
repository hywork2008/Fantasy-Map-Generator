import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogStore } from "./dialogState";

afterEach(() => {
  dialogStore.getState().closeAllDialogs();
});

describe("dialogStore close lifecycle", () => {
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
