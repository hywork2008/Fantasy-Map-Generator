import { describe, expect, it } from "vitest";
import { renderLandscapeLayer } from "../render/landscape";
import { type RenderSelection, renderEditorSvg, renderStandaloneCitySvg } from "../render/svg";
import { createDocument, parseDocument } from "./document";
import { pointInPolygon, polygonCentroid } from "./gen/geom";
import { makeRng } from "./gen/prng";
import type { Cell } from "./gen/types";
import { meshFromCells } from "./mesh";
import {
  clipPolylineToFrame,
  meshShoreChain,
  regionalCoastalWaterPolygons,
  regionalSeaPolygon,
  regionalShoreline
} from "./regionalCoast";
import type { Point } from "./types";
import { lineHitsDocumentWater, waterPolygons } from "./waterGeometry";

function town(turns = 0) {
  const rotate = (p: Point): Point => {
    let [x, y] = p;
    for (let i = 0; i < turns; i++) [x, y] = [-y, x];
    return [x, y];
  };
  const rings: Point[][] = [
    [
      [-100, -100],
      [20, -100],
      [40, -80],
      [30, 0],
      [40, 100],
      [-100, 100]
    ],
    [
      [40, -80],
      [100, -100],
      [100, 100],
      [40, 100],
      [30, 0]
    ]
  ];
  const cells: Cell[] = rings.map((ring, id) => {
    const polygon = ring.map(rotate);
    const centroid = polygonCentroid(polygon);
    return { id, polygon, centroid, site: centroid, neighbors: [1 - id], onBorder: true };
  });
  const doc = createDocument("regional-coast", 600);
  doc.mesh = meshFromCells(cells);
  Object.assign(doc.mesh.faces.f1.properties, { water: "sea", buildable: false });
  doc.coastalOceanFaceIds = ["f1"];
  // FMG's coarse coast is a straight line; the town mesh walked its own jagged shore.
  const walked: Point[] = [
    [20, -100],
    [40, -80],
    [30, 0],
    [40, 100]
  ].map(p => rotate(p as Point));
  const fmg: Point[] = [
    [30, -300],
    [30, 300]
  ].map(p => rotate(p as Point));
  const shore = regionalShoreline(fmg, walked, makeRng("test"));
  doc.regionalWaterAreas = [regionalSeaPolygon(shore, 300, [rotate([70, 0])])!];
  doc.frame.cityRadiusMeters = 30;
  doc.appearance = "town";
  doc.biome = { id: 6, key: "temperateDeciduousForest", name: "Forest", color: "#29bc56" };
  return { doc, rotate };
}

const selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };

describe("regional sea beyond the town mesh", () => {
  it.each([0, 1, 2, 3])("continues the shore to both frame edges from the FMG coast, rotation %s", turns => {
    const { doc, rotate } = town(turns);
    const before = JSON.stringify(doc);
    const polygons = regionalCoastalWaterPolygons(doc);
    const wet = (p: Point) => polygons.some(ring => pointInPolygon(rotate(p), ring));
    // Both regional sea wings exist and stay on FMG's side of the coast.
    for (const y of [-299, -200, 200, 299]) {
      expect(wet([150, y])).toBe(true);
      expect(wet([-50, y])).toBe(false);
    }
    expect(wet([299, 0])).toBe(true);
    // Regional water does not overwrite the editable core (including islands).
    expect(wet([60, 0])).toBe(false);
    expect(wet([0, 0])).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
    expect(regionalCoastalWaterPolygons(doc)).toBe(polygons);
  });

  it("reserves the extended sea for roads even when imported rivers are authoritative", () => {
    const { doc } = town();
    doc.importedFixedCrossings = {
      schemaVersion: 3,
      coordinateUnit: "metres",
      revision: 0,
      originMeters: [0, 0],
      roadWidthMeters: 4,
      requiredBounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      coverageBounds: { minX: -300, minY: -300, maxX: 300, maxY: 300 },
      rivers: [],
      crossings: []
    };
    expect(waterPolygons(doc).some(ring => pointInPolygon([150, 200], ring))).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [150, 150],
          [150, 250]
        ],
        4
      )
    ).toBe(true);
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [-50, 150],
          [-50, 250]
        ],
        4
      )
    ).toBe(false);
    expect(renderStandaloneCitySvg(doc).querySelector(".ce-regional-coastal-water path")).not.toBeNull();
  });

  it("keeps forest on dry land and includes the regional sea in editor, export and saved cities", () => {
    const { doc } = town();
    const trees = renderLandscapeLayer(doc, true).querySelectorAll(".ce-landscape-tree circle");
    expect(trees.length).toBeGreaterThan(0);
    for (const circle of trees) expect(Number(circle.getAttribute("cx"))).toBeLessThan(60);
    const editor = renderEditorSvg(doc, "select", selection, "-300 -300 600 600", 1);
    const standalone = renderStandaloneCitySvg(doc);
    expect(editor.querySelector(".ce-regional-coastal-water")!.outerHTML).toBe(
      standalone.querySelector(".ce-regional-coastal-water")!.outerHTML
    );
    const restored = parseDocument(JSON.stringify(doc))!;
    expect(regionalCoastalWaterPolygons(restored)).toEqual(regionalCoastalWaterPolygons(doc));
  });

  it("has no regional sea without FMG-derived data", () => {
    const { doc } = town();
    delete doc.regionalWaterAreas;
    expect(regionalCoastalWaterPolygons(doc)).toEqual([]);
  });

  it("rejects malformed saved regional water", () => {
    const { doc } = town();
    expect(parseDocument(JSON.stringify({ ...doc, regionalWaterAreas: [[[0, 0]]] }))).toBeNull();
  });
});

describe("regionalShoreline", () => {
  const walked: Point[] = [
    [40, -100],
    [20, -60],
    [45, 0],
    [25, 60],
    [40, 100]
  ];
  const fmg: Point[] = [
    [0, -700],
    [0, 700]
  ];

  it("starts exactly at the town shore and relaxes into FMG's coast without kinks", () => {
    const shore = regionalShoreline(fmg, walked, makeRng("a"));
    const at = shore.findIndex(p => p[0] === 40 && p[1] === 100);
    expect(at).toBeGreaterThan(0);
    const far = shore.filter(p => Math.abs(p[1]) > 450);
    expect(far.length).toBeGreaterThan(10);
    // Far from the town the coast follows FMG, with only the measured roughness left.
    for (const p of far) expect(Math.abs(p[0])).toBeLessThan(40);
    // No step larger than the sampling distance plus the blend slope.
    for (let i = at; i < shore.length - 1; i++)
      expect(Math.hypot(shore[i + 1][0] - shore[i][0], shore[i + 1][1] - shore[i][1])).toBeLessThan(45);
  });

  it("is deterministic per seed and differs between seeds", () => {
    expect(regionalShoreline(fmg, walked, makeRng("a"))).toEqual(regionalShoreline(fmg, walked, makeRng("a")));
    expect(regionalShoreline(fmg, walked, makeRng("a"))).not.toEqual(regionalShoreline(fmg, walked, makeRng("b")));
  });

  it("is not a straight line when FMG's coast is", () => {
    const shore = regionalShoreline(fmg, walked, makeRng("a"));
    expect(new Set(shore.filter(p => p[1] > 300).map(p => p[0].toFixed(1))).size).toBeGreaterThan(5);
  });
});

describe("frame clipping and mesh shore", () => {
  it("cuts FMG's shore exactly at a smaller frame, so the sea still closes", () => {
    const line: Point[] = [
      [30, -750],
      [30, 750]
    ];
    expect(clipPolylineToFrame(line, 400)).toEqual([
      [30, -400],
      [30, 400]
    ]);
    const ring = regionalSeaPolygon(line, 400, [[100, 0]])!;
    expect(pointInPolygon([200, 300], ring)).toBe(true);
    expect(pointInPolygon([-50, 300], ring)).toBe(false);
  });

  it("traces the mesh sea/land boundary border to border", () => {
    const square = (x: number, y: number): Point[] => [
      [x, y],
      [x + 10, y],
      [x + 10, y + 10],
      [x, y + 10]
    ];
    const cells: Cell[] = [0, 1, 2].map(i => {
      const polygon = square(0, i * 10);
      return { id: i, polygon, centroid: [5, i * 10 + 5], site: [5, i * 10 + 5], neighbors: [], onBorder: true };
    });
    const land: Cell[] = [0, 1, 2].map(i => {
      const polygon = square(10, i * 10);
      return { id: 3 + i, polygon, centroid: [15, i * 10 + 5], site: [15, i * 10 + 5], neighbors: [], onBorder: true };
    });
    for (let i = 0; i < 3; i++) {
      cells[i].neighbors = [3 + i, ...(i ? [i - 1] : []), ...(i < 2 ? [i + 1] : [])];
      land[i].neighbors = [i];
    }
    const chain = meshShoreChain([...cells, ...land], new Set([0, 1, 2]))!;
    expect(chain.every(p => p[0] === 10)).toBe(true);
    expect([chain[0][1], chain[chain.length - 1][1]].sort((a, b) => a - b)).toEqual([0, 30]);
  });
});
