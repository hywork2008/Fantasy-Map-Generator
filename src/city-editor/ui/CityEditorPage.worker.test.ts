import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCityOnDocument } from "../core/generate";
import type { GenerationRequest } from "../core/generationWorkerClient";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
let root: HTMLElement;
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
function mount() {
  vi.stubGlobal("Worker", FakeWorker);
  root = document.createElement("div");
  document.body.append(root);
  mountCityEditor(root);
}
function button(text: string) {
  return [...root.querySelectorAll("button")].find(b => b.textContent?.includes(text))!;
}
afterEach(() => {
  root?.remove();
  vi.unstubAllGlobals();
});
describe("background complete generation", () => {
  it("keeps the input and undo history intact when cancelled, then permits a fresh run", async () => {
    mount();
    const before = root.querySelector("svg")!.outerHTML;
    button("都市を一括生成").click();
    expect(root.getAttribute("aria-busy")).toBe("true");
    worker.onmessage!({
      data: { type: "progress", sample: { phase: "urban", elapsedMs: 1, attempt: 1 } }
    } as MessageEvent);
    expect(root.querySelector(".ce-generation-progress")!.textContent).toContain("市街地");
    button("生成をキャンセル").click();
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(root.querySelector("svg")!.outerHTML).toBe(before);
    expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(true);
    button("都市を一括生成").click();
    expect(root.hasAttribute("aria-busy")).toBe(true);
    button("生成をキャンセル").click();
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
  });
  it("logs which stage rejected each attempt when the worker returns no city", async () => {
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    mount();
    button("都市を一括生成").click();
    worker.onmessage!({
      data: {
        type: "progress",
        sample: {
          phase: "urban",
          elapsedMs: 1,
          attempt: 1,
          counts: { urbanArea: 100, minimumUrbanArea: 800000 },
          failure: {
            reason: "urban-area-too-small",
            message: "城壁内の市街地面積 100 m² が最低 800000 m² に届かない",
            details: ["R=792 m"]
          }
        }
      }
    } as MessageEvent);
    expect(root.querySelector(".ce-generation-progress")!.textContent).toContain("市街地");
    expect(root.querySelector(".ce-generation-progress")!.textContent).toContain("不採用");
    worker.onmessage!({ data: { type: "complete", document: null } } as MessageEvent);
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
    expect(error.mock.calls.some(call => String(call[0]).includes("urban-area-too-small"))).toBe(true);
    expect(error.mock.calls.some(call => String(call[0]).includes("市街地"))).toBe(true);
    group.mockRestore();
    error.mockRestore();
    groupEnd.mockRestore();
  });
  it("commits a completed worker result once and supports undo", async () => {
    mount();
    const before = root.querySelector("svg")!.outerHTML;
    button("都市を一括生成").click();
    const { document, settings, seed } = worker.request;
    const city = generateCityOnDocument(document, settings, seed);
    expect(city).not.toBeNull();
    worker.onmessage!({ data: { type: "complete", document: city } } as MessageEvent);
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
    expect(root.querySelector(".ce-building")).not.toBeNull();
    root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.click();
    expect(root.querySelector("svg")!.outerHTML).toBe(before);
  });
});
