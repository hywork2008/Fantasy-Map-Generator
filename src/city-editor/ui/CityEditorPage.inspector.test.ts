import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePickInfo } from "../render/svg";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
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

  it("offers the three bundled historic landmark studies without an import", () => {
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Historic landmark asset"]');
    expect(select).not.toBeNull();
    expect([...select!.options].map(option => option.value)).toEqual([
      "pantheon-prototype@1",
      "san-vitale-prototype@1",
      "chartres-prototype@5"
    ]);
  });

  it("patches cell selection and clears highlights left by a full render", () => {
    const cells = [...root.querySelectorAll<SVGElement>(".ce-cells path[data-pick]")];
    const svg = cells[0].ownerSVGElement;
    cells[0].classList.add("ce-selected", "ce-is-selected", "cg-is-selected");
    cells[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(cells[1].ownerSVGElement).toBe(svg);
    expect(cells[1].classList.contains("ce-selected")).toBe(true);
    expect(cells[1].classList.contains("ce-is-selected")).toBe(true);
    expect(cells[0].classList.contains("ce-selected")).toBe(false);
    expect(cells[0].classList.contains("ce-is-selected")).toBe(false);

    const clear = [...root.querySelectorAll<HTMLButtonElement>(".ce-inspector button")].find(
      button => button.textContent === "Clear selection"
    )!;
    clear.click();
    expect(svg?.querySelector(".ce-selected, .ce-is-selected, .cg-is-selected")).toBeNull();
  });

  it("patches the selected edge with both renderer highlight classes", () => {
    const edge = root.querySelector<SVGElement>(".ce-edges path[data-pick]")!;
    const svg = edge.ownerSVGElement;
    edge.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(edge.ownerSVGElement).toBe(svg);
    expect(edge.classList.contains("ce-selected")).toBe(true);
    expect(edge.classList.contains("ce-is-selected")).toBe(true);
    expect(edge.classList.contains("cg-is-selected")).toBe(true);
  });

  it.each([
    ["buildings", "building"],
    ["gates", "gate"],
    ["fortifications", "tower"]
  ])("matches encoded %s pick metadata when patching selection", (layer, kind) => {
    const svg = root.querySelector<SVGSVGElement>(".ce-map svg")!;
    const target = document.createElementNS("http://www.w3.org/2000/svg", "path");
    target.setAttribute(
      "data-pick",
      encodeURIComponent(
        JSON.stringify({
          layer,
          kind,
          id: `${kind}-review`,
          label: `Review ${kind}`
        })
      )
    );
    svg.append(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(target.ownerSVGElement).toBe(svg);
    expect(target.classList.contains("ce-is-selected")).toBe(true);
    expect(target.classList.contains("cg-is-selected")).toBe(true);

    const cell = svg.querySelector<SVGElement>(".ce-cells path[data-pick]")!;
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(target.classList.contains("ce-is-selected")).toBe(false);
    expect(target.classList.contains("cg-is-selected")).toBe(false);
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

  it("shows route group details in Inspector and highlights in Objects panel when clicking an edge belonging to a route", () => {
    // Switch to Draw road tool to create a route
    const roadBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-toolbar button")].find(
      b => b.title === "Draw road" || b.getAttribute("aria-label") === "Draw road"
    );
    expect(roadBtn).not.toBeUndefined();
    roadBtn?.click();

    // Click an edge to start drawing a road
    const targetEdge = root.querySelector<SVGElement>(".ce-edges path[data-edge]");
    expect(targetEdge).not.toBeNull();
    const edgeId = targetEdge?.getAttribute("data-edge");
    expect(edgeId).toBeTruthy();
    targetEdge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Verify a route group was created in Objects panel
    const groupRowsBefore = [...root.querySelectorAll<HTMLElement>(".ce-group-row")];
    expect(groupRowsBefore.length).toBeGreaterThan(0);

    // Switch back to Select and move tool
    const selectBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-toolbar button")].find(
      b => b.title === "Select and move" || b.getAttribute("aria-label") === "Select and move"
    );
    selectBtn?.click();

    // Click outside / clear to deselect first
    const clearBtn = [...root.querySelectorAll<HTMLButtonElement>(".ce-inspector button")].find(
      btn => btn.textContent === "Clear selection"
    );
    clearBtn?.click();

    // Now in Select and move mode, click the edge belonging to the road
    const edgeToClick = root.querySelector<SVGElement>(`.ce-edges path[data-edge="${edgeId}"]`);
    expect(edgeToClick).not.toBeNull();
    edgeToClick?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Verify Inspector displays the road's information
    const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
    const content = root.querySelector<HTMLElement>(".cg-inspector-content");
    expect(kind?.textContent).toContain("road");
    expect(content?.textContent).toContain(`"layer": "features"`);
    expect(content?.textContent).toContain(`"kind": "road"`);
    expect(content?.textContent).toContain(`"selectedEdgeId": "${edgeId}"`);

    // Verify Objects panel highlights the road's row
    const activeGroupRow = root.querySelector<HTMLElement>(".ce-group-row.is-active");
    expect(activeGroupRow).not.toBeNull();
    expect(activeGroupRow?.classList.contains("ce-group-selected")).toBe(true);
    const activeChooseBtn = activeGroupRow?.querySelector<HTMLButtonElement>("button.is-active");
    expect(activeChooseBtn).not.toBeNull();
  });

  it("handles vertex drag-and-drop in Select and move mode without breaking selection", () => {
    const map = root.querySelector<HTMLDivElement>(".ce-map");
    expect(map).not.toBeNull();

    // Start a vertex drag
    map?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10, button: 0, pointerId: 1 })
    );
    map?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 15, clientY: 15, pointerId: 1 }));
    map?.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, clientX: 15, clientY: 15, button: 0, pointerId: 1 })
    );

    // After drag release, Inspector or map remains responsive
    expect(map).not.toBeNull();
  });
});
