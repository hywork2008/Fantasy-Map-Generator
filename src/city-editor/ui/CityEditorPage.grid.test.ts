import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

// jsdom has no layout engine; the History panel calls this after every commit.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  mountCityEditor(root);
});

afterEach(() => {
  root.remove();
});

const q = <T extends Element>(sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`not found: ${sel}`);
  return el;
};
const docButton = (fragment: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll<HTMLButtonElement>(".ce-document button")].find(c =>
    c.textContent?.includes(fragment)
  );
  if (!b) throw new Error(`document-panel button "${fragment}" not found`);
  return b;
};
/** The stage-scrub slider (not the parameter sliders). */
const gridSlider = (): HTMLInputElement => q<HTMLInputElement>(".ce-grid-step");
/** One of the parameter sliders, in panel order: 0 nPatches, 1 relaxCount, 2 relaxPasses. */
const paramSlider = (index: number): HTMLInputElement => {
  const sliders = [...root.querySelectorAll<HTMLInputElement>(".ce-grid-slider-control input[type='range']")];
  if (!sliders[index]) throw new Error(`grid parameter slider ${index} not found`);
  return sliders[index];
};
const drag = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const gridStatus = (): string => q(".ce-grid-evo-status").textContent ?? "";
const svgCount = (sel: string): number => root.querySelector("svg.ce-svg")?.querySelectorAll(sel).length ?? 0;
const faceCount = (): number => svgCount(".ce-cells .ce-face");
const preview = (): void => docButton("Preview grid evolution").click();

describe("Document panel — Grid evolution (Phase G1)", () => {
  it("has three parameter sliders; the scrub slider is disabled until a preview is built", () => {
    expect(root.querySelector(".ce-grid-controls")).not.toBeNull();
    expect(root.querySelectorAll(".ce-grid-slider-control input[type='range']")).toHaveLength(3);
    expect(paramSlider(0).value).toBe("15"); // DEFAULT_PATCH_PARAMS.nPatches
    expect(gridSlider().disabled).toBe(true);
    expect(docButton("この格子を採用").disabled).toBe(true);
    expect(gridStatus()).toBe("");
  });

  it("Preview builds stages, lands on the final one, and draws the overlay", () => {
    preview();
    const slider = gridSlider();
    expect(slider.disabled).toBe(false);
    const total = Number(slider.max) + 1;
    expect(total).toBeGreaterThan(15 * 8); // one stage per scatter point + relax + final
    expect(slider.value).toBe(slider.max);
    expect(gridStatus()).toMatch(/\/ \d+ · final$/);
    // Sites shown by default, Delaunay hidden by default.
    expect(svgCount(".ce-grid-evolution .ce-grid-site")).toBeGreaterThan(0);
    expect(svgCount(".ce-grid-evolution .ce-grid-delaunay-edge")).toBe(0);
    expect(svgCount(".ce-grid-evolution .ce-grid-cell")).toBeGreaterThan(5);
  });

  it("the slider scrubs one for-loop iteration at a time; early stages have fewer sites", () => {
    preview();
    const slider = gridSlider();
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(gridStatus()).toMatch(/^1 \/ \d+ · scatter 1 \/ /);
    const atStart = svgCount(".ce-grid-evolution .ce-grid-site");
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(gridStatus()).toMatch(/scatter 21 \/ /);
    expect(svgCount(".ce-grid-evolution .ce-grid-site")).toBeGreaterThan(atStart);
  });

  it("the Delaunay layer toggle shows/hides the triangulation overlay", () => {
    preview();
    const delaunayToggle = [...root.querySelectorAll<HTMLInputElement>(".ce-grid-layers input[type='checkbox']")][1];
    delaunayToggle.click();
    expect(svgCount(".ce-grid-evolution .ce-grid-delaunay-edge")).toBeGreaterThan(5);
  });

  it("「採用」 replaces the mesh with the shown stage and undo restores the old grid", () => {
    const before = faceCount();
    preview();
    docButton("この格子を採用").click();
    const after = faceCount();
    expect(after).toBeGreaterThan(3);
    expect(after).not.toBe(before);
    // Overlay is gone once adopted.
    expect(root.querySelector(".ce-grid-evolution")).toBeNull();
    expect(gridSlider().disabled).toBe(true);
    // Undo brings the original grid back.
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(faceCount()).toBe(before);
  });

  it("dragging a parameter slider builds/rebuilds the preview live and lands on the final stage", () => {
    // No "Preview" click needed — the first drag builds it.
    expect(gridSlider().disabled).toBe(true);
    drag(paramSlider(0), "8"); // nPatches
    expect(gridSlider().disabled).toBe(false);
    expect(gridStatus()).toMatch(/· final$/);
    const cellsAt8 = svgCount(".ce-grid-evolution .ce-grid-cell");
    expect(cellsAt8).toBeGreaterThan(3);

    // A bigger nPatches rebuilds with more cells; still on the final stage.
    drag(paramSlider(0), "40");
    expect(gridStatus()).toMatch(/· final$/);
    expect(svgCount(".ce-grid-evolution .ce-grid-cell")).toBeGreaterThan(cellsAt8);
  });

  it("the parameter slider readout tracks the value", () => {
    const nPatches = paramSlider(0);
    const readout = nPatches.nextElementSibling as HTMLElement;
    drag(nPatches, "22");
    expect(readout.textContent).toBe("22");
  });
});

describe("Document panel — new-city grid kind", () => {
  const gridKindSelect = (): HTMLSelectElement => q<HTMLSelectElement>("select.ce-grid-kind");
  const hexSizeSlider = (): HTMLInputElement => q<HTMLInputElement>("input.ce-hex-size");
  const hexSizeLabel = (): HTMLLabelElement => {
    const label = [...root.querySelectorAll("label")].find(el => el.textContent?.startsWith("Hex size"));
    if (!label) throw new Error("Hex size label not found");
    return label;
  };
  const newGrid = (): void => {
    const b = root.querySelector<HTMLButtonElement>('button[title="Generate a new grid"]');
    if (!b) throw new Error("new-grid button not found");
    b.click();
  };
  const chooseGrid = (value: string): void => {
    const sel = gridKindSelect();
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const pathPointCount = (d: string): number => (d.match(/[ML]/gi) ?? []).length;
  const facePointCounts = (): number[] =>
    [...(root.querySelector("svg.ce-svg")?.querySelectorAll(".ce-cells .ce-face") ?? [])].map(el =>
      pathPointCount(el.getAttribute("d") ?? "")
    );

  it("defaults to hexagonal, with the hex-size slider visible", () => {
    expect(gridKindSelect().value).toBe("hex");
    expect(hexSizeLabel().hidden).toBe(false);
    expect(hexSizeSlider().value).toBe("50");
    const counts = facePointCounts();
    const hexes = counts.filter(n => n === 6).length;
    expect(hexes).toBeGreaterThan(counts.length * 0.5);
  });

  it("hides the hex-size slider for Voronoi and Grid evolution", () => {
    chooseGrid("voronoi");
    expect(hexSizeLabel().hidden).toBe(true);
    expect(getComputedStyle(hexSizeLabel()).display).toBe("none");
    chooseGrid("evolution");
    expect(hexSizeLabel().hidden).toBe(true);
    expect(getComputedStyle(hexSizeLabel()).display).toBe("none");
    chooseGrid("hex");
    expect(hexSizeLabel().hidden).toBe(false);
    expect(getComputedStyle(hexSizeLabel()).display).not.toBe("none");
  });

  it("🆕 with Voronoi replaces the hex mesh with an irregular grid", () => {
    const hexFaces = faceCount();
    chooseGrid("voronoi");
    newGrid();
    const after = faceCount();
    expect(after).toBeGreaterThan(400);
    expect(after).not.toBe(hexFaces);
    const counts = facePointCounts();
    const hexes = counts.filter(n => n === 6).length;
    expect(hexes).toBeLessThan(counts.length * 0.5);
  });

  it("🆕 with Grid evolution uses the spiral-scatter mesh (same family as 「採用」)", () => {
    chooseGrid("evolution");
    newGrid();
    const after = faceCount();
    expect(after).toBeGreaterThan(20);
    expect(after).toBeLessThan(200);
  });

  it("the hex-size slider changes generated cell count", () => {
    drag(hexSizeSlider(), "80");
    newGrid();
    const coarse = faceCount();
    drag(hexSizeSlider(), "30");
    newGrid();
    const dense = faceCount();
    expect(dense).toBeGreaterThan(coarse * 2);
  });
});
