import { describe, expect, it } from "vitest";
import { outerWallRing } from "../concealStreets";
import { createGridDocument, parseDocument } from "../document";
import { castleWallIds } from "../fortifications";
import { defaultGenerationSettings, generateCityOnDocument, generateStageOnDocument } from "../generate";
import type { GenerationSample } from "../generationDiagnostics";
import { facePoints, validate } from "../mesh";
import { validGeneratedCrossings } from "../passages";
import type { CityDocument } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import {
  defaultRoadWidthMeters,
  defaultWalledAreaShare,
  evolutionWallInsetRings,
  extendCoreToCoast,
  insetWalledCore,
  MIN_CITY_EXTERNAL_ROADS,
  MIN_FORT_EXTERNAL_ROADS,
  MIN_SETTLEMENT_AREA_SHARE,
  minExternalRoadsForExtent,
  resolveWalledAreaShare,
  SMALL_CITY_EXTENT_METERS
} from "./settlementExtent";
import { synthSite } from "./site/synthSite";
import type { Cell } from "./types";

function cell(id: number, neighbors: number[]): Cell {
  return {
    id,
    site: [0, 0],
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1]
    ],
    centroid: [0, 0],
    neighbors,
    onBorder: false
  };
}

/** Chebyshev-free grid. Edge cells list `-1` so they read as the town boundary. */
function squareGrid(n: number): Cell[] {
  const index = (x: number, y: number) => y * n + x;
  const cells: Cell[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const neighbors: number[] = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        neighbors.push(nx < 0 || ny < 0 || nx >= n || ny >= n ? -1 : index(nx, ny));
      }
      cells.push(cell(index(x, y), neighbors));
    }
  }
  return cells;
}

/** Faces of buildable land between the open country and the nearest walled core. */
function curtainInsetCells(document: CityDocument): number {
  const mesh = document.mesh;
  const outside = (id: string | null | undefined): boolean => {
    if (!id || !mesh.faces[id]) return true;
    const face = mesh.faces[id];
    return face.properties.water !== "land" || !face.properties.buildable;
  };
  const neighborsOf = (id: string): string[] => {
    const ids: string[] = [];
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId];
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (other && mesh.faces[other]) ids.push(other);
    }
    return ids;
  };
  const buildable = Object.values(mesh.faces).filter(
    face => face.properties.water === "land" && face.properties.buildable
  );
  const start = buildable.filter(face => {
    const neighbors = neighborsOf(face.id);
    if (neighbors.length < face.boundary.length) return true;
    return neighbors.some(outside);
  });
  const seen = new Set(start.map(face => face.id));
  const queue = start.map(face => ({ id: face.id, dist: 0 }));
  for (let i = 0; i < queue.length; i++) {
    const { id, dist } = queue[i];
    if (mesh.faces[id].properties.settlement === "core") return dist;
    for (const next of neighborsOf(id)) {
      if (seen.has(next) || outside(next)) continue;
      seen.add(next);
      queue.push({ id: next, dist: dist + 1 });
    }
  }
  return Infinity;
}

function settledArea(document: CityDocument, kind?: "core" | "outskirts") {
  return Object.values(document.mesh.faces)
    .filter(f => f.properties.buildable && (!kind || f.properties.settlement === kind))
    .reduce((sum, f) => sum + Math.abs(polygonArea(facePoints(document.mesh, f))), 0);
}

describe("wall capacity and extramural housing", () => {
  it("joins the core to built-up shore without annexing countryside or disconnected coast", () => {
    const cells = [
      cell(0, [1]),
      cell(1, [0, 2]),
      cell(2, [1, 3, 9]),
      cell(3, [2, 9]),
      cell(4, [9]),
      cell(9, [2, 3, 4])
    ];
    const core = new Set([0]);
    expect(extendCoreToCoast(cells, core, new Set([0, 1, 2, 3, 4]), new Set([9]))).toEqual(new Set([0, 1, 2, 3]));
    expect(core).toEqual(new Set([0]));
    expect(extendCoreToCoast(cells, core, new Set([0, 2, 3]), new Set([9]))).toEqual(core);
  });

  it.each([
    { size: "tiny", imported: false },
    { size: "small", imported: false },
    { size: "medium", imported: false },
    { size: "small", imported: true }
  ] as const)(
    "$size harbour (imported=$imported) keeps a core on the shore and walls only on land",
    ({ size, imported }) => {
      const seed = "open-coastal-core";
      const input = createGridDocument({ size, grid: "evolution", seed });
      const settings = defaultGenerationSettings();
      settings.layout = "organic";
      settings.config.coast = "straight";
      settings.config.rivers = [];
      settings.config.features = { walls: true, citadel: true, plaza: true, temple: false, port: true, shanty: false };
      if (imported) {
        settings.config.rivers = ["toCoast"];
        settings.descriptor = synthSite("smallTown", settings.config, seed, {
          extentMeters: input.frame.extentMeters,
          cityRadiusMeters: input.frame.cityRadiusMeters
        });
        settings.descriptor.burg.capital = true;
      }
      const city = generateCityOnDocument(input, settings, seed);
      expect(city).not.toBeNull();
      if (!city) return;
      expect(validate(city)).toEqual([]);
      expect(validGeneratedCrossings(city)).toBe(true);
      const castleWalls = castleWallIds(city);
      const wallEdges = new Set(
        city.featureGroups.flatMap(g =>
          g.kind === "wall" && !castleWalls.has(g.id) ? g.segments.map(s => s.edgeId) : []
        )
      );
      let coreShore = 0;
      for (const edge of Object.values(city.mesh.edges)) {
        const faces = [edge.leftFace, edge.rightFace].flatMap(id => (id ? [city.mesh.faces[id]] : []));
        if (!faces.some(f => f.properties.water === "sea")) continue;
        if (!faces.some(f => f.properties.water === "land" && f.properties.settlement === "core")) continue;
        coreShore++;
        expect(wallEdges.has(edge.id)).toBe(false);
      }
      expect(coreShore).toBeGreaterThan(0);
      expect(wallEdges.size).toBeGreaterThan(0);
      const seaVertices = new Set(
        Object.values(city.mesh.edges)
          .filter(edge =>
            [edge.leftFace, edge.rightFace].some(id => id && city.mesh.faces[id].properties.water === "sea")
          )
          .flatMap(edge => [edge.a, edge.b])
      );
      // The land curtain ends on water or joins a separately defended castle.
      const castleVertices = new Set(
        city.featureGroups.flatMap(g =>
          g.kind === "wall" && castleWalls.has(g.id)
            ? g.segments.flatMap(s => [city.mesh.edges[s.edgeId].a, city.mesh.edges[s.edgeId].b])
            : []
        )
      );
      const degree = new Map<string, number>();
      for (const id of wallEdges) {
        for (const vertex of [city.mesh.edges[id].a, city.mesh.edges[id].b])
          degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
      }
      expect(
        [...degree].filter(([id, count]) => count === 1 && (seaVertices.has(id) || castleVertices.has(id))).length
      ).toBeGreaterThanOrEqual(2);
    }
  );

  it("requires two map-edge roads for city sizes and one for Micro / Tiny / fort maps", () => {
    expect(SMALL_CITY_EXTENT_METERS).toBe(1200);
    expect([300, 600, 1200, 2400, 4800].map(minExternalRoadsForExtent)).toEqual([
      MIN_FORT_EXTERNAL_ROADS,
      MIN_FORT_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS
    ]);
    expect(minExternalRoadsForExtent(SMALL_CITY_EXTENT_METERS - 1)).toBe(MIN_FORT_EXTERNAL_ROADS);
  });

  it("uses size-dependent defaults and bounds explicit capacity", () => {
    expect([600, 1200, 2400, 4800].map(defaultWalledAreaShare)).toEqual([1, 1, 0.45, 0.2]);
    expect(resolveWalledAreaShare(undefined, 4800)).toBe(0.2);
    expect(resolveWalledAreaShare(Number.NaN, 4800)).toBe(0.2);
    expect(resolveWalledAreaShare(0, 4800)).toBe(0.05);
    expect(resolveWalledAreaShare(2, 4800)).toBe(1);
    expect(MIN_SETTLEMENT_AREA_SHARE).toBe(0.45);
    expect(MIN_SETTLEMENT_AREA_SHARE).not.toBe(defaultWalledAreaShare(4800));
  });

  it("scales road width with medieval standards across city size presets", () => {
    expect([300, 600, 1200, 2400, 4800].map(defaultRoadWidthMeters)).toEqual([3.5, 3.5, 4.5, 6.0, 7.5]);
    expect(defaultRoadWidthMeters(500)).toBe(3.5);
    expect(defaultRoadWidthMeters(1000)).toBe(4.5);
    expect(defaultRoadWidthMeters(2000)).toBe(6.0);
    expect(defaultRoadWidthMeters(5000)).toBe(7.5);
  });

  it("does not reject Medium or Large for wall share versus the settlement-area floor", () => {
    const settings = defaultGenerationSettings();
    for (const size of ["medium", "large"] as const) {
      const input = createGridDocument({ size, grid: "evolution", seed: "share-floor" });
      const samples: GenerationSample[] = [];
      const city = generateCityOnDocument(input, settings, "share-floor", sample => samples.push(sample));
      expect(
        samples.filter(sample => sample.failure?.reason === "urban-area-too-small"),
        size
      ).toEqual([]);
      expect(city, size).not.toBeNull();
      expect(city!.fabric!.generation!.settings.walledAreaShare).toBe(size === "medium" ? 0.45 : 0.2);
    }
  });

  it("changes the core capacity without reducing the total built-up area, and ignores it without walls", () => {
    const input = createGridDocument({ size: "large", grid: "evolution", seed: "capacity" });
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    settings.config.coast = "none";
    settings.config.features.walls = true;
    const low = generateStageOnDocument(input, { ...settings, walledAreaShare: 0.2 }, "capacity", 3)!;
    const high = generateStageOnDocument(input, { ...settings, walledAreaShare: 0.7 }, "capacity", 3)!;
    expect(settledArea(low)).toBeCloseTo(settledArea(high), 5);
    expect(settledArea(low, "core")).toBeLessThan(settledArea(high, "core") * 0.4);
    expect(settledArea(low, "outskirts")).toBeGreaterThan(settledArea(high, "outskirts"));
    settings.config.features.walls = false;
    expect(generateStageOnDocument(input, { ...settings, walledAreaShare: 0.2 }, "capacity", 3)).toEqual(
      generateStageOnDocument(input, { ...settings, walledAreaShare: 0.7 }, "capacity", 3)
    );
  });

  for (const terrain of ["inland", "river", "coast"] as const) {
    it(`large ${terrain}: roadside outskirts stay sparse, with valid crossings and saved capacity`, () => {
      const seed = "phase2-reference";
      const input = createGridDocument({ size: "large", grid: "evolution", seed });
      const before = JSON.stringify(input);
      const settings = defaultGenerationSettings();
      settings.config.coast = terrain === "coast" ? "straight" : "none";
      settings.config.rivers = terrain === "river" ? ["through"] : [];
      settings.config.features.port = terrain === "coast";
      const city = generateCityOnDocument(input, settings, seed)!;
      expect(city).not.toBeNull();
      expect(validate(city)).toEqual([]);
      expect(validGeneratedCrossings(city)).toBe(true);
      expect(city.gates.length).toBeGreaterThan(0);
      const fabric = buildBlockFabric(city);
      const outer = fabric.buildings.filter(b => city.mesh.faces[b.faceId].properties.settlement === "outskirts");
      expect(outer.length).toBeGreaterThan(0);
      expect(outer.length / fabric.buildings.length).toBeLessThan(0.2);
      expect(fabric.lanes.filter(l => city.mesh.faces[l.faceId].properties.settlement === "outskirts").length).toBe(0);
      expect(settledArea(city, "core") / settledArea(city)).toBeLessThan(0.3);
      expect(city.fabric!.generation!.settings.walledAreaShare).toBe(0.2);
      const loaded = parseDocument(JSON.stringify(city))!;
      expect(loaded).not.toBeNull();
      expect(buildBlockFabric(loaded).buildings).toEqual(fabric.buildings);
      expect(JSON.stringify(input)).toBe(before);
      loaded.fabric!.generation!.settings.walledAreaShare = -1;
      expect(parseDocument(JSON.stringify(loaded))).toBeNull();
    }, 30000);
  }
});

describe("evolution curtain inset", () => {
  it("peels whole rings and keeps one connected core", () => {
    const five = squareGrid(5);
    const all = new Set(five.map(c => c.id));
    const once = insetWalledCore(five, all, 1);
    expect(once.urban.size).toBe(9);
    expect(once.peeled.size).toBe(16);
    expect([...once.urban].every(id => !once.peeled.has(id))).toBe(true);
    const twice = insetWalledCore(five, all, 2);
    expect(twice.urban.size).toBe(1);
    expect(twice.peeled.size).toBe(24);
    const single = insetWalledCore([cell(0, [-1])], new Set([0]), 1);
    expect([...single.urban]).toEqual([0]);
    expect(single.peeled.size).toBe(0);
    // A one-cell bridge is boundary, so the ring drops it and keeps one side.
    const bridge = insetWalledCore([cell(0, [1]), cell(1, [0, 2, -1]), cell(2, [1])], new Set([0, 1, 2]), 1);
    expect([...bridge.urban]).toEqual([0]);
    expect([...bridge.peeled].sort()).toEqual([1, 2]);
    // The burg cell stays inside even when a later ring would peel it.
    const anchored = insetWalledCore(five, all, 2, 7);
    expect(anchored.urban.has(7)).toBe(true);
    expect(twice.urban.has(7)).toBe(false);
  });

  it("insets tiny by one cell and small by one or two, and leaves other towns on the settlement edge", () => {
    expect(evolutionWallInsetRings("tiny", "seed", "evolution", true, 1)).toBe(1);
    expect(evolutionWallInsetRings("micro", "seed", "evolution", true, 1)).toBe(0);
    expect(evolutionWallInsetRings("medium", "seed", "evolution", true, 1)).toBe(0);
    expect(evolutionWallInsetRings("large", "seed", "evolution", true, 1)).toBe(0);
    expect(evolutionWallInsetRings("tiny", "seed", "hex", true, 1)).toBe(0);
    expect(evolutionWallInsetRings("tiny", "seed", "voronoi", true, 1)).toBe(0);
    expect(evolutionWallInsetRings("small", "seed", "evolution", false, 1)).toBe(0);
    expect(evolutionWallInsetRings("small", "seed", "evolution", true, 0.45)).toBe(0);
    const small = new Set(
      Array.from({ length: 40 }, (_, i) => evolutionWallInsetRings("small", `seed-${i}`, "evolution", true, 1))
    );
    expect([...small].sort()).toEqual([1, 2]);
    expect(evolutionWallInsetRings("small", "seed-0", "evolution", true, 1)).toBe(
      evolutionWallInsetRings("small", "seed-0", "evolution", true, 1)
    );
  });

  it("places the tiny and small Grid-evolution curtain inside the town so houses stand outside it", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    settings.config.coast = "none";
    settings.config.features.walls = true;
    settings.config.features.shanty = false;
    settings.layout = "organic";
    settings.config.layout = "organic";
    const micro = generateStageOnDocument(
      createGridDocument({ size: "micro", grid: "evolution", seed: "inset-wall" }),
      settings,
      "inset-wall",
      3
    )!;
    expect(curtainInsetCells(micro)).toBe(0);

    for (const size of ["tiny", "small"] as const) {
      const input = createGridDocument({ size, grid: "evolution", seed: "inset-wall" });
      const stage = generateStageOnDocument(input, settings, "inset-wall", 3)!;
      const rings = evolutionWallInsetRings(size, "inset-wall", "evolution", true, 1);
      expect(curtainInsetCells(stage), size).toBe(rings);
      const city = generateCityOnDocument(input, settings, "inset-wall")!;
      expect(city, size).not.toBeNull();
      expect(validate(city), size).toEqual([]);
      const ring = outerWallRing(city);
      expect(ring, size).not.toBeNull();
      const fabric = buildBlockFabric(city);
      const outside = fabric.buildings.filter(building => {
        const center = polygonCentroid(building.polygon);
        return ring !== null && !pointInPolygon(center, ring);
      });
      expect(outside.length, size).toBeGreaterThan(0);
      expect(settledArea(city, "outskirts") / settledArea(city), size).toBeGreaterThan(0.15);
    }
  }, 30000);
});
