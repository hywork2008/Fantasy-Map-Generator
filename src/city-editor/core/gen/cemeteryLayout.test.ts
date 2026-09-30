import { describe, expect, it } from "vitest";
import { meshFromCells } from "../mesh";
import type { CemeteryPlan, CityDocument, Point } from "../types";
import { layoutCemetery, refreshCemeteryLayouts, syncDocumentCemeteries } from "./cemeteryLayout";

function makeMinimalDocument(extent = 1200): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 2,
    frame: { extentMeters: extent, cityRadiusMeters: extent / 2, blockSizeMeters: 50 },
    mesh: {
      vertices: {},
      edges: {},
      faces: {}
    },
    featureGroups: [],
    gates: [],
    elements: []
  };
}

describe("cemeteryLayout", () => {
  it("synchronizes a changed ward without removing other cemetery plans", () => {
    const document = makeMinimalDocument();
    document.mesh = meshFromCells([
      {
        id: 0,
        polygon: [
          [0, 0],
          [60, 0],
          [60, 60],
          [0, 60]
        ],
        site: [30, 30],
        centroid: [30, 30],
        neighbors: [],
        onBorder: false
      },
      {
        id: 1,
        polygon: [
          [70, 0],
          [130, 0],
          [130, 60],
          [70, 60]
        ],
        site: [100, 30],
        centroid: [100, 30],
        neighbors: [],
        onBorder: false
      }
    ]);
    document.mesh.faces.f0.properties.ward = "cemetery";
    document.mesh.faces.f1.properties.ward = "cemetery";
    syncDocumentCemeteries(document, ["f0", "f1"]);
    expect(document.cemeteries?.map(c => c.faceId)).toEqual(["f0", "f1"]);

    document.mesh.faces.f0.properties.ward = "empty";
    syncDocumentCemeteries(document, ["f0"]);
    expect(document.cemeteries?.map(c => c.faceId)).toEqual(["f1"]);
  });

  it("successfully lays out a square cemetery precinct", () => {
    const document = makeMinimalDocument();

    // 60m x 60m square boundary centered at (100, 100)
    const boundary: Point[] = [
      [70, 70],
      [130, 70],
      [130, 130],
      [70, 130]
    ];

    const cemetery: CemeteryPlan = {
      id: "cemetery:1",
      version: 1,
      seed: "cemetery-seed-1",
      form: "churchyard",
      faceId: "f0",
      boundary,
      courtyards: [],
      parts: [],
      accesses: [],
      trees: [],
      gatePoint: [100, 70], // South gate
      provenance: "generated",
      locked: false
    };

    const planned = layoutCemetery(document, cemetery);
    expect(planned).not.toBeNull();
    if (!planned) return;

    // Check that core components are generated
    const roles = planned.parts.map(p => p.role);
    expect(roles).toContain("chapel");
    expect(roles).toContain("ossuary");
    expect(roles).toContain("rectory");
    expect(roles).toContain("calvary");
    expect(roles).toContain("graves");

    // Check that accesses and pathways were created
    expect(planned.accesses.length).toBeGreaterThan(0);

    // Check that decorative Yew trees were planted
    expect(planned.trees.length).toBeGreaterThan(0);

    // Check courtyard open space
    expect(planned.courtyards.length).toBe(1);
  });

  it("handles rectangular boundary with refreshCemeteryLayouts", () => {
    const document = makeMinimalDocument();

    // 80m wide x 50m deep
    const boundary: Point[] = [
      [60, 75],
      [140, 75],
      [140, 125],
      [60, 125]
    ];

    const cemetery: CemeteryPlan = {
      id: "cemetery:rect",
      version: 1,
      seed: "cemetery-seed-rect",
      form: "churchyard",
      faceId: "f1",
      boundary,
      courtyards: [],
      parts: [],
      accesses: [],
      trees: [],
      provenance: "generated",
      locked: false
    };

    document.cemeteries = [cemetery];
    const success = refreshCemeteryLayouts(document);
    expect(success).toBe(true);
    expect(document.cemeteries[0].parts.length).toBeGreaterThanOrEqual(4);
  });

  it("returns null when boundary is too tiny for minimum precinct", () => {
    const document = makeMinimalDocument();

    // 5m x 5m tiny boundary (insufficient for cemetery buildings)
    const boundary: Point[] = [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5]
    ];

    const cemetery: CemeteryPlan = {
      id: "cemetery:tiny",
      version: 1,
      seed: "seed",
      form: "churchyard",
      faceId: "f_tiny",
      boundary,
      courtyards: [],
      parts: [],
      accesses: [],
      trees: [],
      provenance: "generated",
      locked: false
    };

    const planned = layoutCemetery(document, cemetery);
    expect(planned).toBeNull();
  });
});
