import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCityOnDocument } from "../core/generate";
import { captureGenerationDebugPreview } from "../core/generationDebug";
import type { GenerationRequest } from "../core/generationWorkerClient";
import * as cityEditorFile from "../io/cityEditorFile";
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
  vi.restoreAllMocks();
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
  it.each([false, true])(
    "shows a read-only failed city only when enabled (%s), and restores the original map",
    async enabled => {
      vi.spyOn(console, "group").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "groupEnd").mockImplementation(() => {});
      mount();
      const checkbox = root.querySelector<HTMLInputElement>('input[aria-label="デバッグ：生成失敗の途中図を表示"]')!;
      expect(checkbox.checked).toBe(false);
      if (enabled) checkbox.click();
      const before = root.querySelector("svg")!.outerHTML;
      button("都市を一括生成").click();
      expect(worker.request.debugFailure).toBe(enabled);
      const partial = structuredClone(worker.request.document);
      const id = Object.keys(partial.mesh.vertices)[0];
      partial.mesh.vertices[id].point[0] += 10;
      const sample = {
        phase: "gate-routing",
        elapsedMs: 0,
        attempt: 1,
        failure: { reason: "unconnected-gates", message: "門の道路接続を確保できない", details: [id] }
      };
      const preview = captureGenerationDebugPreview(partial, sample, "debug");
      worker.onmessage!({ data: { type: "progress", sample } } as MessageEvent);
      worker.onmessage!({ data: { type: "complete", document: null, failurePreview: preview } } as MessageEvent);
      await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
      expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(true);
      if (enabled) {
        expect(root.querySelector(`[data-location="${id}"]`)).not.toBeNull();
        expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("gate-routing");
        expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("debug");
        root.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(true);
        const exportFailure = vi.spyOn(cityEditorFile, "exportGenerationDebugSvg").mockImplementation(() => {});
        const exportNormal = vi.spyOn(cityEditorFile, "exportCitySvg").mockImplementation(() => {});
        root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
        expect(exportFailure).toHaveBeenCalledWith(preview);
        expect(exportNormal).not.toHaveBeenCalled();
        button("失敗プレビューを閉じる").click();
        root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
        expect(exportNormal).toHaveBeenCalledOnce();
      }
      expect(root.querySelector("svg")!.outerHTML).toBe(before);
    }
  );
  it("shows the first failed checkpoint in non-worker hosts", () => {
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    mount();
    vi.stubGlobal("Worker", undefined);
    root.querySelector<HTMLInputElement>('input[aria-label="デバッグ：生成失敗の途中図を表示"]')!.click();
    const patches = [...root.querySelectorAll("label")]
      .find(l => l.textContent?.includes("③ nPatches"))!
      .querySelector("input")!;
    patches.value = "1";
    patches.dispatchEvent(new Event("change", { bubbles: true }));
    button("都市を一括生成").click();
    expect(root.querySelector(".ce-generation-debug")?.getAttribute("data-attempt")).toBe("1");
    expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("urban-area-too-small");
    expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("橙");
    expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(true);
  });
});
