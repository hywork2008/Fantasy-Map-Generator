import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./dialogService", () => ({ closeAllDialogs: vi.fn() }));

it("preserves embedded previews and component state across minimize and restore", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const mount = vi.fn();
  const cleanup = vi.fn();
  function Preview() {
    useEffect(() => {
      mount();
      return cleanup;
    }, []);
    return <object data="about:blank" aria-label="preview" />;
  }
  try {
    await act(async () => {
      root.render(
        <Dialog isOpen keepContentMountedOnMinimize>
          <Preview />
        </Dialog>
      );
    });
    const content = document.querySelector<HTMLElement>(".fmg-dialog-content")!;
    const preview = content.querySelector("object");
    const toggle = () =>
      document
        .querySelector<HTMLButtonElement>(
          "button[aria-label='dialogs.chrome.minimize'], button[aria-label='dialogs.chrome.restore']"
        )!
        .click();
    await act(async () => toggle());
    expect(content.style.display).toBe("none");
    expect(content.querySelector("object")).toBe(preview);
    expect(cleanup).not.toHaveBeenCalled();
    await act(async () => toggle());
    expect(content.style.display).toBe("");
    expect(content.querySelector("object")).toBe(preview);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
