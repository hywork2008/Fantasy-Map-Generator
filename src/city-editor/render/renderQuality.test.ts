import { describe, expect, it } from "vitest";
import { createDocument, createGridDocument } from "../core/document";
import { defaultGenerationSettings, generateCityOnDocument } from "../core/generate";
import type { CityDocument, Tool } from "../core/types";
import {
  parsePickInfo,
  type RenderQuality,
  type RenderSelection,
  renderEditorSvg,
  renderStandaloneCitySvg
} from "./svg";

const emptySelection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
function town(): CityDocument {
  const doc = createDocument("render-quality", 400);
  doc.appearance = "town";
  for (const face of Object.values(doc.mesh.faces)) {
    Object.assign(face.properties, { water: "land", ward: "craftsmen", buildable: true, settlement: "core" });
  }
  return doc;
}
function render(
  doc: CityDocument,
  quality: RenderQuality,
  selection = emptySelection,
  tool: Tool = "select",
  grid = false
) {
  return renderEditorSvg(
    doc,
    tool,
    selection,
    "-200 -200 400 400",
    1,
    false,
    null,
    null,
    null,
    null,
    false,
    grid,
    undefined,
    false,
    false,
    quality
  );
}
const buildings = (svg: SVGElement) => [...svg.querySelectorAll(".ce-building")];
const polygons = (svg: SVGElement) =>
  buildings(svg).reduce((n, el) => n + (el.getAttribute("d")?.match(/Z/g)?.length ?? 0), 0);

describe("render quality", () => {
  it("batches houses without removing footprints, and expands a selected district for inspection", () => {
    const doc = town();
    const original = JSON.stringify(doc);
    const detailed = render(doc, "detailed");
    const light = render(doc, "light");
    expect(buildings(detailed).length).toBeGreaterThan(10);
    expect(buildings(light).length).toBeLessThan(buildings(detailed).length);
    expect(polygons(light)).toBe(polygons(detailed));
    expect(light.querySelectorAll(".ce-edge")).toHaveLength(0);
    const batch = light.querySelector(".ce-building-batch")!;
    const info = parsePickInfo(batch.getAttribute("data-pick"))!;
    const selected = render(doc, "minimal", { ...emptySelection, faceId: info.faceId as string, inspectedId: info.id });
    const selectedBuildings = buildings(selected).filter(b => b.getAttribute("data-building-face") === info.faceId);
    expect(selectedBuildings.length).toBe(
      buildings(detailed).filter(b => b.getAttribute("data-building-face") === info.faceId).length
    );
    expect(selectedBuildings.every(b => !b.classList.contains("ce-building-batch"))).toBe(true);
    expect(JSON.stringify(doc)).toBe(original);
    expect(polygons(renderStandaloneCitySvg(doc))).toBe(polygons(detailed));
  });

  it("thins only the display, keeps counts, and restores edges for grid display and editing", () => {
    const doc = town();
    const detailed = render(doc, "detailed");
    const minimal = render(doc, "minimal");
    expect(polygons(minimal)).toBeLessThan(polygons(detailed));
    expect(minimal.getAttribute("data-core-buildings")).toBe(detailed.getAttribute("data-core-buildings"));
    expect(render(doc, "minimal").outerHTML).toBe(minimal.outerHTML);
    expect(render(doc, "light", emptySelection, "select", true).querySelectorAll(".ce-edge")).toHaveLength(
      Object.keys(doc.mesh.edges).length
    );
    expect(render(doc, "minimal", emptySelection, "vertex").querySelectorAll(".ce-edge")).toHaveLength(
      Object.keys(doc.mesh.edges).length
    );
    const edgeId = Object.keys(doc.mesh.edges)[0];
    expect(render(doc, "light", { ...emptySelection, edgeId }).querySelector(`[data-edge="${edgeId}"]`)).not.toBeNull();
  });

  it("preserves lane geometry when batching road strokes", () => {
    const seed = "lane-batches";
    const doc = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "evolution", seed }),
      defaultGenerationSettings(),
      seed
    )!;
    const detailed = render(doc, "detailed");
    const light = render(doc, "light");
    const paths = (svg: SVGElement, selector: string) =>
      [...svg.querySelectorAll(selector)]
        .flatMap(node =>
          node
            .getAttribute("d")!
            .split("M")
            .map(part => part.trim())
            .filter(Boolean)
        )
        .sort();
    expect(detailed.querySelectorAll(".ce-infill-lane").length).toBeGreaterThan(1);
    expect(light.querySelectorAll(".ce-infill-lane").length).toBeLessThan(
      detailed.querySelectorAll(".ce-infill-lane").length
    );
    expect(paths(light, ".ce-infill-lane")).toEqual(paths(detailed, ".ce-infill-lane"));
    expect(paths(light, ".ce-infill-trail")).toEqual(paths(detailed, ".ce-infill-trail"));
  });

  it("uses lightweight town rendering automatically for Large frames only", () => {
    const doc = town();
    expect(render(doc, "auto").getAttribute("data-render-quality")).toBe("detailed");
    doc.frame.extentMeters = 4800;
    expect(render(doc, "auto").getAttribute("data-render-quality")).toBe("light");
    expect(render(doc, "auto", emptySelection, "vertex").getAttribute("data-render-quality")).toBe("detailed");
  });
});
