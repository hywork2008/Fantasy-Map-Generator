import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePickInfo } from "../render/svg";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

describe("City Editor Inspector (Select and move mode)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("shows clicked cell details in Inspector panel and keeps edit controls", () => {
    const target = root.querySelector<SVGElement>(".ce-cells path[data-pick]");
    expect(target).not.toBeNull();
    const expected = parsePickInfo(target?.getAttribute("data-pick") ?? null);
    expect(expected).not.toBeNull();

    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
    const content = root.querySelector<HTMLElement>(".cg-inspector-content");
    expect(kind?.textContent).toBe(expected?.label);
    expect(content?.textContent).toContain(`"kind": "cell"`);
    expect(content?.textContent).toContain(`"id": "${expected?.id}"`);

    // Verify cell edit controls are also rendered beneath the JSON inspection
    const editSection = root.querySelector(".ce-inspector-edit-section");
    expect(editSection).not.toBeNull();
    expect(editSection?.textContent).toContain("Ward");
    expect(editSection?.textContent).toContain("Water");
    expect(editSection?.textContent).toContain("Elevation");
  });

  it("clears selection when Clear selection button is clicked", () => {
    const target = root.querySelector<SVGElement>(".ce-cells path[data-pick]");
    expect(target).not.toBeNull();
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const clearButton = [...root.querySelectorAll<HTMLButtonElement>(".ce-inspector button")].find(
      btn => btn.textContent === "Clear selection"
    );
    expect(clearButton).not.toBeUndefined();

    clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(root.querySelector(".cg-inspector-kind")).toBeNull();
    expect(root.querySelector(".cg-inspector-content")).toBeNull();
    expect(root.querySelector(".ce-inspector")?.textContent).toContain("Select a cell");
  });

  it("shows clicked edge details in Inspector panel", () => {
    const edge = root.querySelector<SVGElement>(".ce-edges path[data-pick]");
    expect(edge).not.toBeNull();
    const expected = parsePickInfo(edge?.getAttribute("data-pick") ?? null);

    edge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
    const content = root.querySelector<HTMLElement>(".cg-inspector-content");
    expect(kind?.textContent).toBe(expected?.label);
    expect(content?.textContent).toContain(`"kind": "edge"`);
  });

  it("shows clicked vertex details in Inspector panel", () => {
    // Switch to vertex tool so all vertices are visible
    const vertexBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-toolbar button")].find(
      b => b.title === "Edit vertices" || b.getAttribute("aria-label") === "Edit vertices"
    );
    vertexBtn?.click();

    const vertex = root.querySelector<SVGElement>(".ce-vertices circle[data-pick]");
    expect(vertex).not.toBeNull();

    // Click vertex in vertex tool to make it selected
    vertex?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Switch back to select tool to inspect
    const selectBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-toolbar button")].find(
      b => b.title === "Select and move" || b.getAttribute("aria-label") === "Select and move"
    );
    selectBtn?.click();

    const selectedVertex = root.querySelector<SVGElement>(".ce-vertices circle[data-pick]");
    expect(selectedVertex).not.toBeNull();
    const expected = parsePickInfo(selectedVertex?.getAttribute("data-pick") ?? null);
    selectedVertex?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
    const content = root.querySelector<HTMLElement>(".cg-inspector-content");
    expect(kind?.textContent).toBe(expected?.label);
    expect(content?.textContent).toContain(`"kind": "vertex"`);
  });

  it("shows clicked route / feature group details in Inspector panel", () => {
    const feature = root.querySelector<SVGElement>(".ce-features path[data-pick]");
    if (feature) {
      const expected = parsePickInfo(feature.getAttribute("data-pick"));
      feature.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
      const content = root.querySelector<HTMLElement>(".cg-inspector-content");
      expect(kind?.textContent).toBe(expected?.label);
      expect(content?.textContent).toContain(`"layer": "features"`);
    }
  });

  it("shows clicked building details in town mode in Inspector panel", () => {
    // Click Generate town to populate buildings
    const generateBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-generate button")].find(b =>
      b.textContent?.includes("Generate complete town")
    );
    generateBtn?.click();

    const building = root.querySelector<SVGElement>(".ce-buildings path[data-pick]");
    if (building) {
      const expected = parsePickInfo(building.getAttribute("data-pick"));
      building.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
      const content = root.querySelector<HTMLElement>(".cg-inspector-content");
      expect(kind?.textContent).toBe(expected?.label);
      expect(content?.textContent).toContain(`"kind": "building"`);
    }
  });
});
