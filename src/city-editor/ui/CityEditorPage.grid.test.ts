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
const gridSlider = (): HTMLInputElement => q<HTMLInputElement>(".ce-grid-controls input[type='range']");
const gridStatus = (): string => q(".ce-grid-evo-status").textContent ?? "";
const svgCount = (sel: string): number => root.querySelector("svg.ce-svg")?.querySelectorAll(sel).length ?? 0;
const faceCount = (): number => svgCount(".ce-cells .ce-face");
const preview = (): void => docButton("Preview grid evolution").click();

describe("Document panel — Grid evolution (Phase G1)", () => {
  it("has the controls, disabled until a preview is built", () => {
    expect(root.querySelector(".ce-grid-controls")).not.toBeNull();
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

  it("changing nPatches invalidates a stale preview", () => {
    preview();
    expect(gridSlider().disabled).toBe(false);
    const nPatches = q<HTMLInputElement>(".ce-grid-controls input[type='number']");
    nPatches.value = "10";
    nPatches.dispatchEvent(new Event("change", { bubbles: true }));
    expect(gridSlider().disabled).toBe(true);
    expect(root.querySelector(".ce-grid-evolution")).toBeNull();
  });
});
