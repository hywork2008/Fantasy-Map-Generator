import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import { serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import { createVectorDocument } from "../document";
import { junctionSurface } from "../geometry/network";
import { type PathSurface, surfacesOverlap } from "../geometry/surfaces";
import { validateVectorDocument } from "./document";

const square = (x: number, y: number, size: number): Point[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size]
];
function crossing() {
  const doc = createVectorDocument();
  for (const [id, to] of [
    ["east", [20, 0]],
    ["north", [0, 20]]
  ] as const) {
    doc.paths[id] = {
      id,
      revision: 0,
      role: "road",
      origin: "manual",
      editPolicy: "editable",
      source: { kind: "curve", closed: false, segments: [{ id: "line", kind: "line", from: [0, 0], to: [...to] }] },
      width: { leftMeters: 1, rightMeters: 1, stations: [] }
    };
  }
  doc.connections.nodes.crossing = {
    id: "crossing",
    position: [0, 0],
    anchors: ["east", "north"].map(pathId => ({ pathId, segmentId: "line", t: 0 }))
  };
  return doc;
}

describe("indexed junction-site validation", () => {
  const cases: { name: string; surface: PathSurface; overlaps: boolean }[] = [
    { name: "distant", surface: { outer: square(100, 100, 2), holes: [] }, overlaps: false },
    { name: "overlapping bounds only", surface: { outer: square(0.9, 0.9, 2), holes: [] }, overlaps: false },
    { name: "inside junction", surface: { outer: square(-0.1, -0.1, 0.2), holes: [] }, overlaps: true },
    { name: "containing junction", surface: { outer: square(-2, -2, 4), holes: [] }, overlaps: true },
    { name: "crossing edges", surface: { outer: square(0.5, -1, 2), holes: [] }, overlaps: true },
    { name: "touching", surface: { outer: square(1, 0, 1), holes: [] }, overlaps: true },
    { name: "within segment tolerance", surface: { outer: square(1 + 1e-11, 0, 1), holes: [] }, overlaps: true },
    { name: "beyond segment tolerance", surface: { outer: square(1 + 1e-7, 0, 1), holes: [] }, overlaps: false },
    { name: "junction in hole", surface: { outer: square(-3, -3, 6), holes: [square(-2, -2, 4)] }, overlaps: false }
  ];
  for (const kind of ["placement", "reservation"] as const)
    it.each(cases)(`${kind}: matches exhaustive geometry for $name`, ({ surface, overlaps }) => {
      const doc = crossing();
      if (kind === "placement")
        doc.placements.site = {
          id: "site",
          modelId: "manual:site",
          position: [0, 0],
          facingDegrees: 0,
          origin: "manual",
          editPolicy: "editable",
          site: surface,
          accesses: []
        };
      else doc.regions.site = { id: "site", kind: "reservation", ...surface };
      expect(surfacesOverlap(junctionSurface(doc, "crossing")!, surface)).toBe(overlaps);
      expect(validateVectorDocument(doc)).toEqual(overlaps ? ["junction-site:crossing"] : []);
    });

  it("revalidates in-place site edits during validation, rendering and saving", () => {
    const doc = crossing();
    doc.regions.site = { id: "site", kind: "reservation", outer: square(100, 100, 2), holes: [] };
    expect(validateVectorDocument(doc)).toEqual([]);
    vectorRenderData(doc);
    serializeVectorDocument(doc);
    doc.regions.site.outer = square(-0.1, -0.1, 0.2);
    expect(validateVectorDocument(doc)).toEqual(["junction-site:crossing"]);
    expect(() => vectorRenderData(doc)).toThrow("junction-site:crossing");
    expect(() => serializeVectorDocument(doc)).toThrow("junction-site:crossing");
  });
});
