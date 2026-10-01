import { describe, expect, it } from "vitest";
import {
  civicOrientation,
  nudgeRectOffPolylines,
  orientedRectPolylineDistance,
  orientTempleHybrid,
  placePlazaCluster,
  placeTempleFootprint,
  templeFitsLand,
  templeRectForElement
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

  describe("orientTempleHybrid", () => {
    it("orients apse East in high/late medieval and modern eras", () => {
      // East-west road: baseAngle = 0 (or PI)
      const angleHigh = orientTempleHybrid([0, 0], 0, null, "highMedieval");
      expect(Math.cos(angleHigh)).toBeGreaterThan(0); // Apse points East

      const angleLate = orientTempleHybrid([0, 0], 0, null, "lateMedieval");
      expect(Math.cos(angleLate)).toBeGreaterThan(0); // Apse points East

      const angleExploration = orientTempleHybrid([0, 0], 0, null, "ageOfExploration");
      expect(Math.cos(angleExploration)).toBeGreaterThan(0); // Apse points East
    });

    it("orients apse West in classical antiquity and early medieval eras", () => {
      // East-west road: baseAngle = 0
      const angleAncient = orientTempleHybrid([0, 0], 0, null, "classicalAntiquity");
      expect(Math.cos(angleAncient)).toBeLessThan(0); // Apse points West

      const angleEarly = orientTempleHybrid([0, 0], 0, null, "earlyMedieval");
      expect(Math.cos(angleEarly)).toBeLessThan(0); // Apse points West
    });

    it("faces entrance towards an adjacent plaza regardless of era", () => {
      // Temple at origin, Plaza located to the East [60, 0]
      // Entrance (-X) should face East towards the plaza, meaning apse (+X) faces West
      const angleFacingEastPlaza = orientTempleHybrid([0, 0], 0, [60, 0], "highMedieval");
      expect(Math.cos(angleFacingEastPlaza)).toBeLessThan(0); // Apse points West, entrance points East

      // Temple at origin, Plaza located to the West [-60, 0]
      // Entrance (-X) should face West towards the plaza, meaning apse (+X) faces East
      const angleFacingWestPlaza = orientTempleHybrid([0, 0], 0, [-60, 0], "earlyMedieval");
      expect(Math.cos(angleFacingWestPlaza)).toBeGreaterThan(0); // Apse points East, entrance points West
    });
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

  it("places temple without overlapping roads for user share seed 1m8r7jf:junction-retry:3", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
    const { featureGroupVertices } = await import("../features");
    const { templeRectForElement, orientedRectPolylineDistance } = await import("./civicPlacement");

    const grid = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: "1s5qkgh",
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
    const city = generateCityOnDocument(grid, settings, "1m8r7jf:junction-retry:3");
    expect(city).not.toBeNull();
    const temple = city!.elements.find(e => e.kind === "temple");
    expect(temple).toBeDefined();
    expect(temple!.point).toBeDefined();

    const nave = templeRectForElement(temple!.point!, temple!.sizeMeters, temple!.rotation, city!.frame.extentMeters);

    // Verify temple faces do not contain internal road segments
    const templeFaces = new Set(temple!.faceIds);
    const internalTempleEdges = new Set(
      Object.values(city!.mesh.edges)
        .filter(e => e.leftFace && e.rightFace && templeFaces.has(e.leftFace) && templeFaces.has(e.rightFace))
        .map(e => e.id)
    );

    const roadGroups = city!.featureGroups.filter(g => g.kind === "road");
    for (const rg of roadGroups) {
      for (const seg of rg.segments) {
        expect(internalTempleEdges.has(seg.edgeId)).toBe(false);
      }
      const segPoints = featureGroupVertices(city!, rg)
        .map(id => city!.mesh.vertices[id]?.point)
        .filter((p): p is [number, number] => !!p);
      if (segPoints.length < 2) continue;
      const distToNave = orientedRectPolylineDistance(nave, segPoints);
      // Carriageway half-width must not touch the temple nave
      const minClearance = rg.style.widthMeters / 2;
      expect(distToNave).toBeGreaterThan(minClearance);
    }
  });
});

describe("organic temple wall clearance", () => {
  it.each([0, 12, 24])("keeps the full nave clear of a wall at x=%s", x => {
    const cells = grid(9, 20);
    const wall: Point[] = [
      [x, -100],
      [x, 100]
    ];
    const placed = placeTempleFootprint(
      cells,
      new Set(cells.map(c => c.id)),
      new Set(),
      null,
      new Set(),
      600,
      20,
      false,
      [],
      [],
      [wall]
    );
    expect(placed).not.toBeNull();
    const rect = templeRectForElement(placed!.anchor, undefined, placed!.rotation, 600);
    expect(orientedRectPolylineDistance(rect, wall)).toBeGreaterThanOrEqual(5.8);
  });
});

it.each(["organic-wall-1", "organic-wall-2", "organic-wall-3"])("clears finished organic walls for %s", async seed => {
  const { createGridDocument } = await import("../document");
  const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
  const { featureGroupVertices } = await import("../features");
  const document = createGridDocument({ size: "tiny", grid: "evolution", seed });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.config.layout = "organic";
  settings.config.coast = "none";
  settings.config.rivers = [];
  settings.config.features.walls = true;
  settings.config.features.temple = true;
  settings.config.features.citadel = false;
  settings.config.features.port = false;
  const city = generateCityOnDocument(document, settings, seed);
  expect(city).not.toBeNull();
  const temple = city!.elements.find(element => element.kind === "temple");
  expect(temple?.point).toBeDefined();
  const rect = templeRectForElement(temple!.point!, temple!.sizeMeters, temple!.rotation, city!.frame.extentMeters);
  const walls = city!.featureGroups.filter(group => group.kind === "wall");
  expect(walls.length).toBeGreaterThan(0);
  for (const wall of walls) {
    const points = featureGroupVertices(city!, wall).map(id => city!.mesh.vertices[id].point);
    expect(orientedRectPolylineDistance(rect, points)).toBeGreaterThanOrEqual(wall.style.widthMeters / 2 + 3.8);
  }
});

describe("temple land containment", () => {
  it("does not let the fallback placement protrude into a sea cell", () => {
    const cells = [square(0, -10, 0, 20, [1]), square(1, 10, 0, 20, [0])];
    const placed = placeTempleFootprint(
      cells,
      new Set([0]),
      new Set(),
      null,
      new Set(),
      600,
      20,
      false,
      [],
      [],
      [],
      new Set([1])
    );
    expect(placed).toBeNull();
  });
  const land = [square(0, -30, 0, 60).polygon];
  const sea = [square(1, 30, 0, 60).polygon];
  it("rejects a nave whose center is on land but its rotated corner reaches the sea", () => {
    const rect = { center: [-8, 0] as Point, length: 28, width: 16, rotation: Math.PI / 4 };
    expect(templeFitsLand(rect, land, sea)).toBe(false);
    expect(templeFitsLand({ ...rect, center: [-25, 0] }, land, sea)).toBe(true);
  });
  it("rejects a nave beyond the mapped land", () => {
    expect(templeFitsLand({ center: [-65, 0], length: 28, width: 16, rotation: 0 }, land, sea)).toBe(false);
  });
  it("rejects a narrow inlet even when all corners are dry", () => {
    const rect = { center: [0, 0] as Point, length: 28, width: 16, rotation: 0 };
    const inlet: Point[] = [
      [-1, 2],
      [1, 2],
      [1, 30],
      [-1, 30]
    ];
    expect(templeFitsLand(rect, [square(0, 0, 0, 100).polygon], [inlet])).toBe(false);
  });
});

it.each(["bay", "cape", "straight"] as const)("keeps finished organic temple on land with %s coast", async coast => {
  const { createGridDocument } = await import("../document");
  const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
  const { facePoints } = await import("../mesh");
  const seed = `temple-sea-${coast}`;
  const document = createGridDocument({ size: "tiny", grid: "evolution", seed });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.config.layout = "organic";
  settings.config.coast = coast;
  settings.config.rivers = [];
  settings.config.features.walls = true;
  settings.config.features.temple = true;
  settings.config.features.citadel = false;
  settings.config.features.port = true;
  const city = generateCityOnDocument(document, settings, seed);
  expect(city).not.toBeNull();
  const temple = city!.elements.find(element => element.kind === "temple");
  expect(temple?.point).toBeDefined();
  const rect = templeRectForElement(temple!.point!, temple!.sizeMeters, temple!.rotation, city!.frame.extentMeters);
  const faces = Object.values(city!.mesh.faces);
  const land = faces.filter(face => face.properties.water === "land").map(face => facePoints(city!.mesh, face));
  const water = faces.filter(face => face.properties.water !== "land").map(face => facePoints(city!.mesh, face));
  expect(water.length).toBeGreaterThan(0);
  expect(templeFitsLand(rect, land, water)).toBe(true);
});
