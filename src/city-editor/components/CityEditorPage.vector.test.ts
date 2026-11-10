import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import incomingFixture from "../data/fixtures/gothengsfeld-20261012.json";
import * as documentGenerator from "../generators/document";
import { createVectorDocument, createVectorExample } from "../generators/vector/document";
import * as cityFiles from "../services/io/cityEditorFile";
import { serializeVectorDocument } from "../services/io/vector/documentCodec";
import { encodeVectorShare } from "../services/io/vector/share";
import { mountCityEditor } from "./CityEditorPage";

let root: HTMLElement;
let dispose: () => void;
beforeEach(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  root = document.createElement("div");
  document.body.append(root);
  dispose = () => {};
});
afterEach(() => {
  dispose();
  root.remove();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const click = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click();
function useMeshless() {
  const control = root.querySelector<HTMLSelectElement>(".ce-generation-method")!;
  control.value = "vector-first";
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("meshless editor boundary", () => {
  it.each([
    [800, 800],
    [1000, 600],
    [600, 1000]
  ])("zooms vector SVGs around the cursor in a %i by %i viewport without rebuilding geometry", (width, height) => {
    dispose = mountCityEditor(root, { initialDocument: createVectorExample() });
    const checkZoom = () => {
      const svg = root.querySelector<SVGSVGElement>(".ce-vector-svg")!;
      const path = svg.querySelector("[data-vector-path]");
      vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
        left: 70,
        top: 40,
        width,
        height
      } as DOMRect);
      const initial = svg.getAttribute("viewBox")!;
      const extent = Number(initial.split(/\s+/)[2]);
      const clientX = 70 + width * 0.7,
        clientY = 40 + height * 0.3;
      const cursorPosition = () => {
        const [x, y, size] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
        return [
          x + size / 2 + ((clientX - 70 - width / 2) * size) / Math.min(width, height),
          y + size / 2 + ((clientY - 40 - height / 2) * size) / Math.min(width, height)
        ];
      };
      const anchor = cursorPosition();
      for (const deltaY of [-250, -250, 100, -10000, -10000, 10000, 10000]) {
        const event = new WheelEvent("wheel", { deltaY, clientX, clientY, bubbles: true, cancelable: true });
        svg.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        const position = cursorPosition();
        expect(position[0]).toBeCloseTo(anchor[0], 8);
        expect(position[1]).toBeCloseTo(anchor[1], 8);
        const size = Number(svg.getAttribute("viewBox")!.split(/\s+/)[2]);
        expect(size).toBeGreaterThanOrEqual(extent / 20);
        expect(size).toBeLessThanOrEqual(extent);
        if (deltaY === -250) expect(size).toBeLessThan(extent);
      }
      expect(root.querySelector(".ce-vector-svg")).toBe(svg);
      expect(svg.querySelector("[data-vector-path]")).toBe(path);
    };
    checkZoom();
    click(".ce-vector-example");
    checkZoom();
  });

  it("hands the current FMG descriptor to the dedicated vector input preview", () => {
    sessionStorage.setItem("fmg.citySite", JSON.stringify(incomingFixture.descriptor));
    dispose = mountCityEditor(root);
    useMeshless();
    const linked = root.querySelector<HTMLButtonElement>('[data-generation-action="linked"]')!;
    expect(linked.disabled).toBe(false);
    linked.click();
    expect(root.querySelector("[data-vector-surveyed-water]")).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.click();
    expect(root.querySelectorAll("[data-vector-bridge]")).toHaveLength(1);
    expect(root.dataset.documentFormat).toBe("fmg-vector-city");
  });
  it("releases retained mode documents when the editor is explicitly closed", () => {
    dispose = mountCityEditor(root, { initialDocument: createVectorExample() });
    const previousDispose = dispose;
    dispose();
    dispose = mountCityEditor(root);
    previousDispose();
    useMeshless();
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
    dispose();
    expect(root.childElementCount).toBe(0);
  });

  it("ignores a pending file read after another document transaction", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof cityFiles.readCityMap>>>();
    vi.spyOn(cityFiles, "readCityMap").mockReturnValueOnce(pending.promise);
    dispose = mountCityEditor(root, { initialDocument: createVectorDocument() });
    const input = root.querySelector<HTMLInputElement>(".ce-vector-file")!;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "pending.json")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    click(".ce-vector-example");
    pending.resolve({ source: "vector-city", document: createVectorDocument("stale") });
    await pending.promise;
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    click(".ce-vector-undo");
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
  });

  it("routes a vector file dropped into the mesh editor before calling mesh-only import logic", async () => {
    dispose = mountCityEditor(root);
    const grid = vi.spyOn(documentGenerator, "createGridDocument");
    const file = new File([serializeVectorDocument(createVectorExample())], "vector.json");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
    root.querySelector(".ce-map")!.dispatchEvent(drop);
    await vi.waitFor(() => expect(root.dataset.documentFormat).toBe("fmg-vector-city"));
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    expect(grid).not.toHaveBeenCalled();
  });

  it("opens a vector document before grid construction, and previews exact curves with Undo and Redo", () => {
    const grid = vi.spyOn(documentGenerator, "createGridDocument");
    dispose = mountCityEditor(root, { initialDocument: createVectorDocument() });
    expect(grid).not.toHaveBeenCalled();
    expect(root.dataset.documentFormat).toBe("fmg-vector-city");
    expect(root.querySelector(".ce-generate-stage-slider")).toBeNull();
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
    click(".ce-vector-example");
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    expect(root.querySelector('[data-vector-path="circle"]')!.getAttribute("d")).toContain("A30 30");
    expect(root.querySelector('[data-vector-path="water"]')!.getAttribute("d")).toContain("C-50 -150 50 -30 150 -110");
    expect(root.querySelectorAll("[data-vector-node]")).toHaveLength(2);
    click(".ce-vector-undo");
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
    click(".ce-vector-redo");
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    expect(grid).not.toHaveBeenCalled();
    dispose();
    expect(root.childElementCount).toBe(0);
  });

  it("switches from the existing selector and restores the mesh document, settings and history", () => {
    dispose = mountCityEditor(root);
    const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
    seed.value = "preserved-mesh-seed";
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    const history = root.querySelector(".ce-history")?.textContent;
    const geometry = root.querySelector(".ce-svg")?.innerHTML;
    const grid = vi.spyOn(documentGenerator, "createGridDocument");
    useMeshless();
    expect(root.dataset.documentFormat).toBe("fmg-vector-city");
    expect(root.querySelector<HTMLInputElement>('[data-generation-field="seed"]')!.value).toBe("preserved-mesh-seed");
    expect(root.querySelector<HTMLInputElement>('[data-generation-field="population"]')!.value).toBe("5000");
    expect(root.querySelector('[data-generation-action="city"]')).not.toBeNull();
    expect(grid).not.toHaveBeenCalled();
    click(".ce-vector-example");
    click(".ce-vector-return");
    expect(root.dataset.documentFormat).toBe("fmg-city-editor");
    expect(root.querySelector<HTMLInputElement>(".ce-generate-seed")!.value).toBe("preserved-mesh-seed");
    expect(root.querySelector(".ce-history")?.textContent).toBe(history);
    expect(root.querySelector(".ce-svg")?.innerHTML).toBe(geometry);
    useMeshless();
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    dispose();
    expect(root.childElementCount).toBe(0);
  });

  it("imports valid vector files transactionally and keeps the current document on invalid input", async () => {
    dispose = mountCityEditor(root, { initialDocument: createVectorDocument() });
    const input = root.querySelector<HTMLInputElement>(".ce-vector-file")!;
    const importFile = (value: string) => {
      Object.defineProperty(input, "files", { configurable: true, value: [new File([value], "vector.json")] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    importFile(serializeVectorDocument(createVectorExample()));
    await vi.waitFor(() => expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5));
    importFile('{"format":"fmg-vector-city","version":2}');
    await vi.waitFor(() =>
      expect(root.querySelector(".ce-vector-status")!.textContent).toBe(editorText("cityEditor.vector.invalidDocument"))
    );
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    click(".ce-vector-undo");
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
  });
});

describe("vector share navigation", () => {
  it("opens a complete vector share before constructing cells and consumes a later hash navigation", () => {
    const document = createVectorExample(),
      token = encodeVectorShare({
        kind: "fmg-vector-city-share",
        version: 1,
        mode: "document",
        document,
        stage: "regions"
      });
    globalThis.history.replaceState(null, "", `#${token}`);
    const grid = vi.spyOn(documentGenerator, "createGridDocument");
    dispose = mountCityEditor(root);
    expect(grid).not.toHaveBeenCalled();
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(5);
    expect(location.hash).toBe("");
    const empty = encodeVectorShare({
      kind: "fmg-vector-city-share",
      version: 1,
      mode: "document",
      document: createVectorDocument(),
      stage: "regions"
    });
    globalThis.history.replaceState(null, "", `#${empty}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(root.querySelectorAll("[data-vector-path]")).toHaveLength(0);
    expect(location.hash).toBe("");
  });
});
