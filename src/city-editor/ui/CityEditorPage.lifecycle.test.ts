import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import type { GenerationRequest } from "../core/generationWorkerClient";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
let root: HTMLElement, dispose: () => void;
let worker: FakeWorker;
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  onmessageerror = null;
  request!: GenerationRequest;
  terminate = vi.fn();
  constructor() {
    worker = this;
  }
  postMessage(request: GenerationRequest) {
    this.request = structuredClone(request);
  }
}
beforeEach(async () => {
  await i18n.changeLanguage("en");
  root = document.createElement("div");
  document.body.append(root);
});
afterEach(() => {
  dispose?.();
  root.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function button(label: string) {
  return [...root.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
}

describe("editor mount boundaries", () => {
  it("cancels the old worker and global keyboard bindings when remounting the same root", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const removed = vi.spyOn(window, "removeEventListener");
    dispose = mountCityEditor(root);
    button("Generate complete city").click();
    const old = worker,
      deliver = old.onmessage!;
    expect(root.getAttribute("aria-busy")).toBe("true");
    dispose = mountCityEditor(root);
    const svg = root.querySelector("svg")!.outerHTML;
    expect(old.terminate).toHaveBeenCalledOnce();
    expect(removed.mock.calls.some(([event]) => event === "keydown")).toBe(true);
    deliver({ data: { type: "progress", sample: { phase: "urban", attempt: 1, elapsedMs: 0 } } } as MessageEvent);
    deliver({ data: { type: "complete", document: old.request.document } } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(root.querySelector("svg")!.outerHTML).toBe(svg);
  });

  it("keeps panel settings when minimized repeatedly and makes retained controls inert on disposal", () => {
    dispose = mountCityEditor(root);
    const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
    seed.value = "preserved-seed";
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    const panel = seed.closest(".ce-panel")!,
      minimize = panel.querySelector<HTMLButtonElement>(".ce-panel-collapse")!;
    for (let i = 0; i < 20; i++) {
      minimize.click();
      minimize.click();
    }
    expect(seed.value).toBe("preserved-seed");
    dispose();
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    minimize.click();
    expect(root.childNodes).toHaveLength(0);
  });

  it("does not change the URL or retired DOM after a clipboard promise resolves", async () => {
    let resolve!: () => void;
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>(done => {
            resolve = done;
          })
      }
    });
    const updateUrl = vi.spyOn(window.history, "replaceState");
    try {
      dispose = mountCityEditor(root);
      button("Copy shareable link").click();
      dispose();
      resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(updateUrl).not.toHaveBeenCalled();
      expect(root.childNodes).toHaveLength(0);
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
