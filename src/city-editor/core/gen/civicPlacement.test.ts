import { describe, expect, it } from "vitest";
import {
  civicOrientation,
  nudgeRectOffPolylines,
  orientedRectPolylineDistance,
  placePlazaCluster,
  placeTempleFootprint
} from "./civicPlacement";
import type { Cell, Point } from "./types";

function square(id: number, x: number, y: number, size = 20, neighbors: number[] = []): Cell {
  const h = size / 2;
  const polygon: Point[] = [
    [x - h, y - h],
    [x + h, y - h],
    [x + h, y + h],
    [x - h, y + h]
  ];
  return { id, site: [x, y], polygon, centroid: [x, y], neighbors, onBorder: false };
}

function grid(n: number, size: number): Cell[] {
  const cells: Cell[] = [];
  const origin = -((n - 1) / 2) * size;
  const at = (i: number, j: number) => i * n + j;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const neighbors: number[] = [];
      if (i > 0) neighbors.push(at(i - 1, j));
      if (i + 1 < n) neighbors.push(at(i + 1, j));
      if (j > 0) neighbors.push(at(i, j - 1));
      if (j + 1 < n) neighbors.push(at(i, j + 1));
      cells.push(square(at(i, j), origin + j * size, origin + i * size, size, neighbors));
    }
  }
  return cells;
}

describe("civic orientation", () => {
  it("aligns the long axis with the nearest road, otherwise a plaza edge", () => {
    expect(
      civicOrientation(
        [0, 12],
        [
          [
            [-40, 0],
            [40, 0]
          ]
        ]
      )
    ).toBeCloseTo(0, 6);
    expect(
      Math.abs(
        civicOrientation(
          [12, 0],
          [
            [
              [0, -40],
              [0, 40]
            ]
          ]
        )
      )
    ).toBeCloseTo(Math.PI / 2, 6);
    const plaza: Point[] = [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10]
    ];
    expect(civicOrientation([0, 16], [plaza])).toBeCloseTo(0, 6);
  });
});

describe("plaza and temple clearance", () => {
  const cells = grid(7, 20);
  const urban = new Set(cells.map(c => c.id));

  it("grows a Tiny plaza off a river that bisects the origin", () => {
    const river: Point[][] = [
      [
        [0, -80],
        [0, 80]
      ]
    ];
    const plaza = placePlazaCluster(cells, urban, new Set(), new Set(), river, 600, 20, false);
    expect(plaza).toBeTruthy();
    expect(plaza!.cellIds.length).toBeGreaterThan(1);
    const byId = new Map(cells.map(c => [c.id, c]));
    for (const id of plaza!.cellIds) {
      expect(Math.abs(byId.get(id)!.centroid[0])).toBeGreaterThan(8);
    }
  });

  it("rotates the temple to the nearest street and keeps the nave off that street", () => {
    const plazaCells = cells.filter(c => Math.abs(c.centroid[0]) <= 10 && Math.abs(c.centroid[1]) <= 10);
    const plazaIds = plazaCells.map(c => c.id);
    const occupied = new Set(plazaIds);
    const streets: Point[][] = [
      [
        [10, -40],
        [10, 40]
      ]
    ];
    const temple = placeTempleFootprint(
      cells,
      urban,
      occupied,
      { cellIds: plazaIds, anchor: [0, 0] },
      new Set(),
      600,
      20,
      false,
      streets,
      []
    );
    expect(temple).toBeTruthy();
    const axis = Math.abs(temple!.rotation);
    expect(axis < 0.05 || Math.abs(axis - Math.PI / 2) < 0.05).toBe(true);
    expect(temple!.cellIds.some(id => occupied.has(id))).toBe(false);
    const nave = {
      center: temple!.anchor,
      length: 28,
      width: 16,
      rotation: temple!.rotation
    };
    expect(orientedRectPolylineDistance(nave, streets[0])).toBeGreaterThanOrEqual(6);
  });
});

describe("nudgeRectOffPolylines", () => {
  it("slides a nave that sits on a road until the carriageway is clear", () => {
    const road: Point[] = [
      [-40, 0],
      [40, 0]
    ];
    const moved = nudgeRectOffPolylines({ center: [0, 2], length: 28, width: 16, rotation: 0 }, [
      { points: road, clearance: 6 }
    ]);
    expect(orientedRectPolylineDistance(moved, road)).toBeGreaterThanOrEqual(5.9);
    expect(Math.abs(moved.center[1])).toBeGreaterThan(8);
  });
});

describe("user URL reproduction", () => {
  it("places temple without overlapping roads", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
    const { featureGroupVertices } = await import("../features");
    const { templeRectForElement } = await import("./civicPlacement");
    const { buildBlockFabric } = await import("./blockInfill");

    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "ywonn2",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.relief = false;
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;
    settings.config.features.citadel = false;
    settings.config.features.port = false;
    settings.config.features.shanty = true;
    settings.config.wall = {
      envelope: "auto",
      coast: "auto",
      line: "auto"
    };
    settings.streets = {
      farNode: "descriptorEnd",
      avoidSea: true,
      foldSmoothing: true
    };
    const city = generateCityOnDocument(grid, settings, "1e95j8q");
    expect(city).not.toBeNull();
    const temple = city!.elements.find(e => e.kind === "temple");
    expect(temple).toBeDefined();
    expect(temple!.point).toBeDefined();

    const plaza = city!.elements.find(e => e.kind === "plaza");
    expect(plaza).toBeDefined();

    const nave = templeRectForElement(temple!.point!, temple!.sizeMeters, temple!.rotation, city!.frame.extentMeters);

    // Verify clearance from all roads (at least 10 meters)
    const roadGroups = city!.featureGroups.filter(g => g.kind === "road");
    for (const rg of roadGroups) {
      const segPoints = featureGroupVertices(city!, rg)
        .map(id => city!.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (segPoints.length < 2) continue;
      const distToNave = orientedRectPolylineDistance(nave, segPoints);
      expect(distToNave).toBeGreaterThanOrEqual(10);
    }

    // Verify clearance from all rivers (at least 10 meters)
    const riverGroups = city!.featureGroups.filter(g => g.kind === "river");
    for (const river of riverGroups) {
      const pts = river.vertices.map(v => city!.mesh.vertices[v]?.point).filter((p): p is Point => !!p);
      if (pts.length < 2) continue;
      const distToNave = orientedRectPolylineDistance(nave, pts);
      expect(distToNave).toBeGreaterThanOrEqual(10);
    }

    // Check infill lanes and buildings
    const fabric = buildBlockFabric(city!);

    // No lanes should hit the temple nave
    for (const lane of fabric.lanes) {
      const distToNave = orientedRectPolylineDistance(nave, lane.points);
      expect(distToNave).toBeGreaterThanOrEqual(1.8);
    }

    // No lanes should be generated inside plaza faces
    for (const lane of fabric.lanes) {
      expect(plaza!.faceIds).not.toContain(lane.faceId);
    }

    // No lanes should be generated inside temple faces
    for (const lane of fabric.lanes) {
      expect(temple!.faceIds).not.toContain(lane.faceId);
    }
  });

  it("inspects plaza and road overlap for seed 1cgyyha", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");

    const grid = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "qcn6t9",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.relief = false;
    settings.config.features.walls = true;
    settings.config.features.plaza = true;
    settings.config.features.temple = true;
    settings.config.features.citadel = false;
    settings.config.features.port = false;
    settings.config.features.shanty = true;
    settings.config.wall = {
      envelope: "auto",
      coast: "auto",
      line: "auto"
    };
    settings.streets = {
      farNode: "descriptorEnd",
      avoidSea: true,
      foldSmoothing: true
    };
    const city = generateCityOnDocument(grid, settings, "1cgyyha");
    expect(city).not.toBeNull();
    const plaza = city!.elements.find(e => e.kind === "plaza");
    expect(plaza).toBeDefined();

    const roadGroups = city!.featureGroups.filter(g => g.kind === "road");

    // Plaza faces
    const plazaFaces = new Set(plaza!.faceIds);
    const perimeterEdges: string[] = [];
    const internalEdges: string[] = [];

    for (const edge of Object.values(city!.mesh.edges)) {
      const inLeft = edge.leftFace && plazaFaces.has(edge.leftFace);
      const inRight = edge.rightFace && plazaFaces.has(edge.rightFace);
      if (inLeft && inRight) {
        internalEdges.push(edge.id);
      } else if (inLeft || inRight) {
        perimeterEdges.push(edge.id);
      }
    }

    const internalPlazaEdgesSet = new Set(internalEdges);
    expect(internalPlazaEdgesSet.size).toBeGreaterThan(0);

    for (const group of roadGroups) {
      for (const seg of group.segments) {
        if (seg.edgeId) {
          expect(internalPlazaEdgesSet.has(seg.edgeId)).toBe(false);
        }
      }
    }
  });
});
