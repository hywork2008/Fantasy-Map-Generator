import { describe, expect, it } from "vitest";
import { createDocument } from "../core/document";
import { fixedDocumentGeometry } from "./fixedDocumentGeometry";
import { type RenderSelection, renderEditorSvg, renderStandaloneCitySvg } from "./svg";

const selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };

function coastalTown() {
  const doc = createDocument("map-frame", 400);
  doc.appearance = "town";
  // A surveyed river continues well beyond the city frame. Its actual geometry
  // must survive export/editing while the camera can move into unknown space.
  doc.importedFixedCrossings = {
    schemaVersion: 3,
    coordinateUnit: "metres",
    revision: 0,
    originMeters: [0, 0],
    roadWidthMeters: 4,
    requiredBounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    coverageBounds: { minX: -200, minY: -200, maxX: 200, maxY: 200 },
    rivers: [
      {
        id: 1,
        geometryVersion: 1,
        rings: [
          [
            [100, -1000],
            [1000, -1000],
            [1000, 1000],
            [100, 1000]
          ]
        ],
        sourceSegments: [0],
        artificialCaps: [],
        bankPrecisionMeters: 1
      }
    ],
    crossings: []
  };
  return doc;
}

function expectFrame(svg: SVGSVGElement) {
  const scene = svg.querySelector(".ce-map-scene")!;
  expect(scene.getAttribute("clip-path")).toBe("url(#ce-map-frame)");
  const rect = svg.querySelector("#ce-map-frame > rect")!;
  expect(["x", "y", "width", "height"].map(key => rect.getAttribute(key))).toEqual(["-200", "-200", "400", "400"]);
  expect(svg.style.backgroundColor).toBe("");
  expect([...svg.querySelectorAll("style")].map(style => style.textContent).join("\n")).not.toMatch(/background:\s*#/);
  expect(svg.querySelectorAll(".ce-background")).toHaveLength(1);
  expect(scene.firstElementChild?.classList.contains("ce-background")).toBe(true);
  for (const layer of svg.children) {
    expect(["defs", "style"].includes(layer.localName) || layer === scene).toBe(true);
  }
  expect(scene.querySelector(".ce-fixed-river-water")?.getAttribute("transform")).toBe("scale(1,-1)");
  expect(scene.querySelector("[data-river-id='1']")?.getAttribute("d")).toContain("1000");
}

describe("fixed city map frame", () => {
  it("clips all layers in world coordinates across camera changes and editing modes without mutating source water", () => {
    const doc = coastalTown();
    const original = JSON.stringify(doc);
    for (const tool of ["select", "vertex"] as const) {
      const svg = renderEditorSvg(doc, tool, selection, "-600 -800 1200 1200", 0.3);
      expectFrame(svg);
      svg.setAttribute("viewBox", "800 900 1600 1600");
      expectFrame(svg);
    }
    expect(JSON.stringify(doc)).toBe(original);
  });

  it("uses the same frame and ground rectangle in standalone output", () => {
    const svg = renderStandaloneCitySvg(coastalTown());
    expectFrame(svg);
    expect(svg.getAttribute("viewBox")).toBe("-200 -200 400 400");
  });

  it("rejects incomplete surveyed coverage in both current water schemas", () => {
    for (const schemaVersion of [3, 4] as const) {
      const doc = coastalTown();
      doc.importedFixedCrossings!.schemaVersion = schemaVersion;
      if (schemaVersion === 4) {
        doc.importedFixedCrossings!.obstacles = doc.importedFixedCrossings!.rivers.map(({ id, rings }) => ({
          id,
          rings
        }));
        doc.importedFixedCrossings!.rivers = [];
      }
      expect(fixedDocumentGeometry(doc)).not.toBeNull();
      doc.importedFixedCrossings!.coverageBounds!.maxX = 199;
      expect(fixedDocumentGeometry(doc)).toBeNull();
    }
  });
});
