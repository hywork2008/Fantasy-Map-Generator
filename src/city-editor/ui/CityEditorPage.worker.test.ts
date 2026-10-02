import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCityOnDocument } from "../core/generate";
import { captureGenerationDebugPreview } from "../core/generationDebug";
import type { GenerationRequest } from "../core/generationWorkerClient";
import * as cityEditorFile from "../io/cityEditorFile";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
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
  it.each([false, true])("adopts an editable failed city only when enabled (%s), and supports undo", async enabled => {
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
    expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(!enabled);
    if (enabled) {
      expect(root.querySelector(`[data-location="${id}"]`)).not.toBeNull();
      expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("gate-routing");
      expect(root.querySelector(".ce-generation-debug-summary")!.textContent).toContain("debug");
      root.querySelector<HTMLButtonElement>('button[title="Edit vertices"]')?.click();
      expect(root.querySelector(`[data-location="${id}"]`)).not.toBeNull();
      const vertexTool = [...root.querySelectorAll<HTMLButtonElement>(".ce-toolbar button")].find(b =>
        b.title.toLowerCase().includes("vert")
      );
      vertexTool!.click();
      const vertex = root.querySelector<SVGElement>(`[data-vertex="${id}"]`)!;
      expect(vertex).not.toBeNull();
      vertex.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      root.querySelector<HTMLButtonElement>('button[title="Select and move"]')!.click();
      root
        .querySelector<SVGElement>(`[data-vertex="${id}"]`)!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(root.querySelector(".cg-inspector-content")!.textContent).toContain(id);
      expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(false);
      const exportFailure = vi.spyOn(cityEditorFile, "exportGenerationDebugSvg").mockImplementation(() => {});
      const exportNormal = vi.spyOn(cityEditorFile, "exportCitySvg").mockImplementation(() => {});
      root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
      expect(exportFailure).toHaveBeenCalledWith(
        expect.objectContaining({ seed: preview.seed, sample: preview.sample, highlights: preview.highlights })
      );
      expect(exportNormal).not.toHaveBeenCalled();
      button("失敗箇所の強調を閉じる").click();
      root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
      expect(exportNormal).toHaveBeenCalledOnce();
      expect(exportNormal.mock.calls[0][0].mesh.vertices[id].point).toEqual(partial.mesh.vertices[id].point);
      const map = root.querySelector<HTMLElement>(".ce-map")!;
      vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 1200,
        width: 1200,
        height: 1200,
        toJSON: () => {}
      });
      const [x, y] = partial.mesh.vertices[id].point;
      map.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: -y }));
      map.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x + 1, clientY: -y - 1 }));
      map.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: x + 1, clientY: -y - 1 }));
      root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
      expect(exportNormal.mock.calls.at(-1)![0].mesh.vertices[id].point).toEqual([x + 1, y + 1]);
      expect(JSON.parse(root.querySelector(".cg-inspector-content")!.textContent!).point).toEqual([x + 1, y + 1]);
      root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.click();
      root.querySelector<HTMLButtonElement>('button[title="Export city map as SVG"]')!.click();
      expect(exportNormal.mock.calls.at(-1)![0].mesh.vertices[id].point).toEqual([x, y]);
      root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.click();
    }
    expect(root.querySelector("svg")!.outerHTML).toBe(before);
  });
  it("keeps the failed city when editing after a previously accepted city", async () => {
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    mount();
    button("都市を一括生成").click();
    const accepted = structuredClone(worker.request.document);
    accepted.generationSeed = "previous-city";
    worker.onmessage!({ data: { type: "complete", document: accepted } } as MessageEvent);
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
    root.querySelector<HTMLInputElement>('input[aria-label="デバッグ：生成失敗の途中図を表示"]')!.click();
    button("都市を一括生成").click();
    const partial = structuredClone(worker.request.document);
    const id = Object.keys(partial.mesh.vertices)[0];
    partial.mesh.vertices[id].point[0] += 2;
    const sample = {
      phase: "gate-routing",
      elapsedMs: 0,
      attempt: 1,
      failure: { reason: "unconnected-gates", message: "failed", details: [id] }
    };
    const preview = captureGenerationDebugPreview(partial, sample, "next-city");
    worker.onmessage!({ data: { type: "progress", sample } } as MessageEvent);
    worker.onmessage!({ data: { type: "complete", document: null, failurePreview: preview } } as MessageEvent);
    await vi.waitFor(() => expect(root.hasAttribute("aria-busy")).toBe(false));
    root.querySelector<HTMLButtonElement>('button[title="Draw road"]')!.click();
    const save = vi.spyOn(cityEditorFile, "exportCityMap").mockImplementation(() => {});
    root.querySelector<HTMLButtonElement>('button[title="Export editable city map (JSON)"]')!.click();
    expect(save.mock.calls[0][0].mesh.vertices[id].point).toEqual(partial.mesh.vertices[id].point);
    expect(save.mock.calls[0][0].generationSeed).toBe("next-city");
  });
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
    expect(root.querySelector<HTMLButtonElement>('button[title="Undo"]')!.disabled).toBe(false);
  });
});
