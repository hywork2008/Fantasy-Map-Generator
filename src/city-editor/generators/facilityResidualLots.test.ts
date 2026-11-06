import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { createDocument } from "./document";
import { packFacilityResidualLots } from "./facilityResidualLots";
import { facilityPlacementOrder } from "./facilityUses";
import { meshFromCells } from "./mesh";
import { intersectConvex, plotArea } from "./parcelGeometry";

function rectangle(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
}

function block(cells: { id: number; polygon: Point[] }[]) {
  const document = createDocument("facility-residual", 400);
  document.mesh = meshFromCells(
    cells.map(cell => ({
      id: cell.id,
      polygon: cell.polygon,
      site: [(cell.polygon[0][0] + cell.polygon[2][0]) / 2, (cell.polygon[0][1] + cell.polygon[2][1]) / 2],
      centroid: [(cell.polygon[0][0] + cell.polygon[2][0]) / 2, (cell.polygon[0][1] + cell.polygon[2][1]) / 2],
      neighbors: [],
      onBorder: true
    }))
  );
  document.elements = [];
  document.featureGroups = [];
  document.gates = [];
  for (const face of Object.values(document.mesh.faces))
    Object.assign(face.properties, {
      water: "land",
      elevation: 3,
      ward: "merchant",
      buildable: true,
      locked: false,
      settlement: "core"
    });
  const south = Object.values(document.mesh.edges).filter(edge => {
    const a = document.mesh.vertices[edge.a].point;
    const b = document.mesh.vertices[edge.b].point;
    return a[1] === 0 && b[1] === 0;
  });
  document.featureGroups = [
    {
      id: "road",
      kind: "road",
      name: "Road",
      locked: false,
      style: { widthMeters: 2, color: "#888" },
      segments: south.map(edge => ({ edgeId: edge.id, forward: true }))
    }
  ];
  return document;
}

describe("facility residual lots", () => {
  it("fills a street-front gap beside a facility without covering the measured site", () => {
    const document = block([{ id: 0, polygon: rectangle(0, 0, 48, 22) }]);
    const site = rectangle(2, 12, 16, 21);
    document.landmarks = [
      {
        id: "population-facility:workshop:baking:0",
        assetId: "bakehouse",
        assetRevision: "1",
        position: [9, 16.5],
        rotation: 0,
        scale: 1,
        site: [{ outer: site, holes: [] }],
        accesses: [
          {
            entranceId: "main",
            points: [
              [9, 14],
              [9, 13]
            ],
            widthMeters: 1.2,
            target: { kind: "road", id: "road", point: [9, 0] }
          }
        ],
        locked: false
      }
    ];
    const packed = packFacilityResidualLots(document, [], []);
    expect(packed.buildings.length).toBeGreaterThanOrEqual(3);
    const covered = packed.buildings.reduce((sum, lot) => sum + plotArea(lot.polygon), 0);
    expect(covered).toBeGreaterThan(150);
    for (const lot of packed.buildings) {
      expect(plotArea(intersectConvex(lot.polygon, site))).toBeLessThan(0.05);
      expect(lot.landmark).toBe(false);
      expect(lot.uses).toEqual(["residential"]);
    }
    expect(packFacilityResidualLots(document, [], [])).toEqual(packed);
  });

  it("joins residuals split only by a mesh bookkeeping edge", () => {
    const document = block([
      { id: 0, polygon: rectangle(0, 0, 3.2, 20) },
      { id: 1, polygon: rectangle(3.2, 0, 6.4, 20) }
    ]);
    document.landmarks = [
      {
        id: "population-facility:workshop:baking:0",
        assetId: "bakehouse",
        assetRevision: "1",
        position: [3.2, 14],
        rotation: 0,
        scale: 1,
        site: [{ outer: rectangle(0.3, 9, 6.1, 19), holes: [] }],
        accesses: [
          {
            entranceId: "main",
            points: [
              [3.2, 12],
              [3.2, 11]
            ],
            widthMeters: 1,
            target: { kind: "road", id: "road", point: [3.2, 0] }
          }
        ],
        locked: false
      }
    ];
    const packed = packFacilityResidualLots(document, [], []);
    expect(packed.buildings.length).toBeGreaterThanOrEqual(1);
    for (const lot of packed.buildings)
      expect(plotArea(intersectConvex(lot.polygon, rectangle(0.3, 9, 6.1, 19)))).toBeLessThan(0.05);
  });

  it("leaves ordinary landmarks to the existing housing pass", () => {
    const document = block([{ id: 0, polygon: rectangle(0, 0, 40, 20) }]);
    document.landmarks = [
      {
        id: "guild:textiles",
        assetId: "hall",
        assetRevision: "1",
        position: [8, 12],
        rotation: 0,
        scale: 1,
        site: [{ outer: rectangle(2, 8, 14, 18), holes: [] }],
        accesses: [],
        locked: false
      }
    ];
    expect(packFacilityResidualLots(document, [], [])).toEqual({ buildings: [], openSpaces: [] });
  });
});

describe("facility placement order", () => {
  it("places river and larger sites before small craft workshops", () => {
    const asset = (width: number, depth: number, dwellings?: number) => ({
      residentialDwellings: dwellings,
      minimumSite: [{ outer: rectangle(-width / 2, -depth / 2, width / 2, depth / 2) }]
    });
    const ordered = facilityPlacementOrder([
      { id: "craft-small", asset: asset(8, 10, 1), zone: "core" as const, use: "craft" as const },
      { id: "commerce-large", asset: asset(14, 12), zone: "core" as const, use: "commerce" as const },
      {
        id: "river",
        asset: asset(10, 12),
        zone: "outskirts" as const,
        use: "river" as const,
        riverbankMaxDistanceMeters: 50
      },
      { id: "hazard", asset: asset(12, 10), zone: "outskirts" as const, use: "hazard" as const },
      { id: "commerce-small", asset: asset(8, 8), zone: "core" as const, use: "commerce" as const }
    ]);
    expect(ordered.map(request => request.id)).toEqual([
      "river",
      "hazard",
      "commerce-large",
      "commerce-small",
      "craft-small"
    ]);
  });
});
