import { describe, expect, it } from "vitest";
import { BURIAL_CULTURE_PRESETS } from "../../../data/burialCultures";
import type { Cell, CemeteryPlan, CityDocument, Point } from "../types";
import { layoutCemetery } from "./cemeteryLayout";
import { assignWards, type WardInputs } from "./wards";

function createDummyCell(id: number, centroid: Point, neighbors: number[]): Cell {
  const [cx, cy] = centroid;
  const s = 10;
  return {
    id,
    centroid,
    neighbors,
    polygon: [
      [cx - s, cy - s],
      [cx + s, cy - s],
      [cx + s, cy + s],
      [cx - s, cy + s]
    ],
    onBorder: false,
    area: 400
  };
}

describe("cemeteryCulture integration", () => {
  it("places cemetery on riverfront when culture zoning is riverfront_ghat", () => {
    const cells: Cell[] = [
      createDummyCell(0, [0, 0], [1, 3]),
      createDummyCell(1, [15, 0], [0, 2]),
      createDummyCell(2, [50, 0], [1]),
      createDummyCell(3, [0, 50], [0])
    ];

    const riverLine: Point[] = [
      [48, -30],
      [48, 30]
    ];

    const inputs: WardInputs = {
      cells,
      urban: new Set([0, 1]),
      outskirts: new Set([2, 3]),
      sea: new Set(),
      borders: [],
      gates: [],
      precincts: [{ kind: "plaza", cellIds: [0], anchor: [0, 0] }],
      geo: { bounds: [0, 0, 100, 100], riverCentres: [], roadPaths: [] } as any,
      params: {
        seed: "ghat-test",
        cityRadiusMeters: 50,
        cellSizeMeters: 20,
        extentMeters: 600,
        nPatches: 4
      } as any,
      program: {
        walls: true,
        citadel: false,
        plaza: true,
        temple: false,
        port: false,
        shanty: false,
        capital: false
      } as any,
      shoreline: null,
      waterPolygon: null,
      streets: [],
      rivers: [riverLine],
      burialProfile: BURIAL_CULTURE_PRESETS.varanasi_ghat
    };

    const result = assignWards(inputs);
    const cemeteryWard = result.wards.find(w => w.kind === "cemetery");
    expect(cemeteryWard).toBeDefined();
    // Cell 2 is directly along the riverline
    expect(cemeteryWard?.cellId).toBe(2);
  });

  it("places cemetery along highway approach when culture zoning is extramural_highway", () => {
    const cells: Cell[] = [
      createDummyCell(0, [0, 0], [1]),
      createDummyCell(1, [15, 0], [0, 2, 3]),
      createDummyCell(2, [60, 25], [1]), // near road
      createDummyCell(3, [60, 100], [1]) // far from road
    ];

    const road: Point[] = [
      [0, 0],
      [100, 0]
    ];

    const inputs: WardInputs = {
      cells,
      urban: new Set([0, 1]),
      outskirts: new Set([2, 3]),
      sea: new Set(),
      borders: [],
      gates: [{ point: [15, 0], angle: 0 }],
      precincts: [{ kind: "plaza", cellIds: [0], anchor: [0, 0] }],
      geo: { bounds: [0, 0, 100, 100], riverCentres: [], roadPaths: [] } as any,
      params: {
        seed: "highway-test",
        cityRadiusMeters: 50,
        cellSizeMeters: 20,
        extentMeters: 600,
        nPatches: 4
      } as any,
      program: {
        walls: true,
        citadel: false,
        plaza: true,
        temple: false,
        port: false,
        shanty: false,
        capital: false
      } as any,
      shoreline: null,
      waterPolygon: null,
      streets: [road],
      burialProfile: BURIAL_CULTURE_PRESETS.roman_via_appia
    };

    const result = assignWards(inputs);
    const cemeteryWard = result.wards.find(w => w.kind === "cemetery");
    expect(cemeteryWard).toBeDefined();
    // Cell 2 is alongside the highway
    expect(cemeteryWard?.cellId).toBe(2);
  });

  it("omits trees in layoutCemetery when vegetation is barren_gravel", () => {
    const mockDocument: CityDocument = {
      mesh: {
        faces: {},
        edges: {},
        vertices: {}
      },
      featureGroups: []
    } as any;

    const baseCemetery: CemeteryPlan = {
      id: "cemetery:1",
      version: 1,
      seed: "cemetery-gravel",
      form: "churchyard",
      faceId: "f1",
      boundary: [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20]
      ],
      courtyards: [],
      parts: [],
      accesses: [],
      trees: [],
      provenance: "generated",
      locked: false,
      burialProfile: BURIAL_CULTURE_PRESETS.sunni_wahhabi // barren_gravel
    };

    const layout = layoutCemetery(mockDocument, baseCemetery);
    expect(layout).not.toBeNull();
    expect(layout?.trees.length).toBe(0);

    // With medieval parish (sacred_yew), trees should be present
    const yewCemetery: CemeteryPlan = {
      ...baseCemetery,
      burialProfile: BURIAL_CULTURE_PRESETS.medieval_parish
    };
    const yewLayout = layoutCemetery(mockDocument, yewCemetery);
    expect(yewLayout).not.toBeNull();
    expect(yewLayout?.trees.length).toBeGreaterThan(0);
  });
});
