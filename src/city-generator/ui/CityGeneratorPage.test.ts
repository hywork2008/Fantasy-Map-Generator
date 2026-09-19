import { afterEach, describe, expect, it } from "vitest";
import { parsePickInfo } from "../render/svg";
import { mountCityGenerator } from "./CityGeneratorPage";

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("City Generator Inspector", () => {
  it("shows the clicked SVG feature's details in the inspector panel", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountCityGenerator(root);

    const target = root.querySelector<SVGElement>('.cg-step[data-step="4"] path[data-pick]');
    expect(target).not.toBeNull();
    const expected = parsePickInfo(target?.getAttribute("data-pick") ?? null);
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const inspector = root.querySelector<HTMLElement>(".cg-panel--inspector");
    expect(inspector?.hidden).toBe(false);
    expect(root.querySelector(".cg-inspector-kind")?.textContent).toBe(expected?.label);
    expect(root.querySelector(".cg-inspector-content")?.textContent).toContain(`"kind": "${expected?.kind}"`);
  });
});

describe("City Generator — urban nPatches debug tool (towngen-comparison.md §2.1)", () => {
  it("setting nPatches regenerates the town with exactly that many urban cells", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountCityGenerator(root);

    const nPatchesInput = root.querySelector<HTMLInputElement>('.cg-panel--process input[type="number"]');
    expect(nPatchesInput).not.toBeNull();
    nPatchesInput!.value = "6";
    nPatchesInput!.dispatchEvent(new Event("change", { bubbles: true }));

    const urbanTagCount = [...root.querySelectorAll<SVGElement>('.cg-step[data-step="3"] path[data-pick]')].filter(
      el => parsePickInfo(el.getAttribute("data-pick"))?.tag === "urban"
    ).length;
    expect(urbanTagCount).toBe(6);

    // Clearing the field falls back to the (larger, radius-based) default core.
    nPatchesInput!.value = "";
    nPatchesInput!.dispatchEvent(new Event("change", { bubbles: true }));
    const clearedCount = [...root.querySelectorAll<SVGElement>('.cg-step[data-step="3"] path[data-pick]')].filter(
      el => parsePickInfo(el.getAttribute("data-pick"))?.tag === "urban"
    ).length;
    expect(clearedCount).toBeGreaterThan(6);
  });

  it("the urban-core-evolution slider steps through the flood-fill one cell at a time", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountCityGenerator(root);

    const rangeInputs = root.querySelectorAll<HTMLInputElement>('.cg-panel--process input[type="range"]');
    expect(rangeInputs).toHaveLength(3); // Stage, Grid evolution, Urban core evolution.
    const urbanSlider = rangeInputs[2];

    urbanSlider.value = "3"; // slider value 3 → urbanIndex 2 → the 3rd admitted cell.
    urbanSlider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector(".cg-urbanwrap")?.style.display).toBe("inline");
    expect(root.querySelector(".cg-stepwrap")?.style.display).toBe("none");
    const stage = root.querySelector<SVGGElement>('.cg-ustage[data-ustage="2"]');
    expect(stage?.style.display).toBe("inline");
    const urbanTagCount = [...stage!.querySelectorAll<SVGElement>("path[data-pick]")].filter(el =>
      parsePickInfo(el.getAttribute("data-pick"))?.label?.startsWith("urban")
    ).length;
    expect(urbanTagCount).toBe(3);
  });
});
