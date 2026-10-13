import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorLifetime } from "./editorLifetime";

let root: HTMLElement;
let lifetime: EditorLifetime;
afterEach(() => {
  lifetime?.dispose();
  root?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function mount() {
  root = document.createElement("div");
  document.body.append(root);
  lifetime = new EditorLifetime(root);
  return lifetime;
}

describe("editor resource ownership", () => {
  it("disposes once and prevents global listeners and timers from running after detachment", async () => {
    vi.useFakeTimers();
    const scope = mount(),
      effect = vi.fn(),
      cleanup = vi.fn();
    scope.listen(window, "keydown", effect);
    scope.timeout(effect, 100);
    scope.own(cleanup);
    root.remove();
    await Promise.resolve();
    window.dispatchEvent(new KeyboardEvent("keydown"));
    vi.runAllTimers();
    scope.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(effect).not.toHaveBeenCalled();
  });

  it("releases replaced panel controls while keeping the current panel functional", () => {
    const scope = mount(),
      panel = document.createElement("div"),
      old = document.createElement("button"),
      effect = vi.fn();
    root.append(panel);
    panel.append(old);
    scope.listen(old, "click", effect);
    const current = document.createElement("button");
    scope.listen(current, "click", effect);
    scope.replaceChildren(panel, current);
    old.click();
    current.click();
    expect(effect).toHaveBeenCalledOnce();
    scope.dispose();
    current.click();
    expect(effect).toHaveBeenCalledOnce();
  });

  it("rejects superseded requests and all requests after disposal", () => {
    const scope = mount(),
      old = scope.ticket("import"),
      current = scope.ticket("import");
    expect(old()).toBe(false);
    expect(current()).toBe(true);
    scope.invalidate("import");
    expect(current()).toBe(false);
    const clipboard = scope.ticket("clipboard");
    scope.dispose();
    expect(clipboard()).toBe(false);
  });
});
