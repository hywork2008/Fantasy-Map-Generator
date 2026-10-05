import { beforeEach, describe, expect, it } from "vitest";
import { createGridDocument, descriptorFrameGridOptions, parseDocument } from "../city-editor/core/document";
import { buildBlockFabric } from "../city-editor/core/gen/blockInfill";
import { townExtentMeters } from "../city-editor/core/gen/settlementExtent";
import type { BurgSiteDescriptor as CESite } from "../city-editor/core/gen/site/burgSiteDescriptor";
import { siteToGeography } from "../city-editor/core/gen/site/siteInput";
import { defaultGenerationSettings, generateCityOnDocument } from "../city-editor/core/generate";
import { applyImportedFixedCrossings } from "../city-editor/core/importedFixedCrossings";
import { polygonHitsDocumentWater } from "../city-editor/core/waterGeometry";
import { decodeShare, encodeShare, shareFromDescriptor } from "../city-editor/io/incomingCity";
import { renderCityPreviewSvg } from "../city-editor/render/previewSvg";
import { renderStandaloneCitySvg } from "../city-editor/render/svg";
import { worldContext } from "../context/worldContext";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { populationWindowMeters } from "../utils/requiredSiteBounds";
import { countBurgRoadLegs, getBurgSiteDescriptor } from "./burgSiteDescriptor";

import { settlementRiverGeometry } from "./settlementRiverSite";

/**
 * Synthetic world: 1 map unit = 1 km (distanceScale 1, unit km).
 *
 * - Burg 1 "Testburg" at (100, 100), 10 population points × rate 1000 = 10 000 people.
 * - River 1 flows north → south along x = 100.2 (200 m east of the town center).
 *   Cell spacing 4 units keeps addMeandering from inserting extra points, so the
 *   centerline is exactly the vertical line through the given cell points.
 * - One road runs west → east through the burg cell: (80,100) → (100,100) → (120,100),
 *   with burg 2 "Eastville" at the eastern end.
 */
function setupRiverCrossingWorld() {
  const p: [number, number][] = [
    [100, 100], // 0: burg cell
    [100.2, 88], // 1..6: river course, north to south
    [100.2, 92],
    [100.2, 96],
    [100.2, 100],
    [100.2, 104],
    [100.2, 108],
    [80, 100], // 7: road west
    [120, 100] // 8: road east (burg 2)
  ];
  const cellCount = p.length;
  const c: number[][] = Array.from({ length: cellCount }, () => [0]);
  c[0] = [1, 2, 3, 4, 5, 6, 7, 8];

  worldContext.pack = {
    cells: {
      p,
      c,
      h: new Uint8Array(cellCount).fill(25),
      r: Uint16Array.from([0, 1, 1, 1, 1, 1, 1, 0, 0]),
      fl: Uint16Array.from([0, 200, 200, 200, 200, 200, 200, 0, 0]),
      conf: new Uint8Array(cellCount),
      haven: new Uint32Array(cellCount),
      harbor: new Uint8Array(cellCount),
      g: new Uint32Array(cellCount),
      biomeCode: new Uint8Array(cellCount).fill(6),
      burg: Uint16Array.from([1, 0, 0, 0, 0, 0, 0, 0, 2]),
      f: new Uint16Array(cellCount)
    },
    rivers: [{ i: 1, cells: [1, 2, 3, 4, 5, 6], widthFactor: 1, sourceWidth: 0.1, name: "Testflow", type: "River" }],
    routes: [
      {
        i: 0,
        group: "roads",
        feature: 1,
        points: [
          [80, 100, 7],
          [100, 100, 0],
          [120, 100, 8]
        ]
      }
    ],
    burgs: [
      {},
      { i: 1, cell: 0, x: 100, y: 100, population: 10, name: "Testburg" },
      { i: 2, cell: 8, x: 120, y: 100, population: 1, name: "Eastville" }
    ],
    features: [0],
    vertices: { p: [] }
  } as unknown as PackedGraph;

  worldContext.grid = { cells: { temp: Int8Array.from([15]) } } as unknown as Grid;
  worldContext.seed = "1234";
  worldContext.graphWidth = 200;
  worldContext.graphHeight = 200;
  worldContext.distanceScale = 1;
  worldContext.populationRate = 1000;
  worldContext.urbanization = 1;
}

describe("getBurgSiteDescriptor", () => {
  beforeEach(setupRiverCrossingWorld);
  it("exports the canonical physical water without inventing a bridge and retains it through CE save/render", () => {
    const site = getBurgSiteDescriptor(1)!;
    const payload = site.fixedCrossings!;
    const resolved = settlementRiverGeometry(worldContext, worldContext.pack.rivers[0], "km");
    if (!("geometry" in resolved)) throw new Error(resolved.reason);
    expect(payload?.schemaVersion).toBe(2);
    expect(payload.crossings).toEqual([]);
    expect(validFixedBurgCrossings({ ...payload, schemaVersion: 1 }, FIXED_SITE_CROSSING_BUDGETS)).toBe(false);
    expect(validFixedBurgCrossings(payload, { ...FIXED_SITE_CROSSING_BUDGETS, maxWaterVertices: 1 })).toBe(false);
    expect(payload.rivers[0].rings).toEqual(
      resolved.geometry.water.rings.map(ring => ring.map(p => [p[0] - 100000, 100000 - p[1]]))
    );
    const geography = siteToGeography(site as unknown as CESite);
    expect(geography.rivers).toEqual([]);
    expect(geography.channels).toEqual([]);
    const doc = createGridDocument({
      size: "small",
      extentMeters: site.frame.extentMeters,
      cityRadiusMeters: site.frame.cityRadiusMeters
    });
    applyImportedFixedCrossings(doc, site as unknown as CESite);
    const restored = parseDocument(JSON.stringify(doc))!;
    expect(restored.importedFixedCrossings).toEqual(payload);
    const svg = renderStandaloneCitySvg(restored);
    const preview = renderCityPreviewSvg(restored);
    expect(preview.querySelector(".ce-fixed-river-water")?.outerHTML).toBe(
      svg.querySelector(".ce-fixed-river-water")?.outerHTML
    );
    expect(preview.querySelector(".ce-fixed-crossings")?.outerHTML).toBe(
      svg.querySelector(".ce-fixed-crossings")?.outerHTML
    );
    const water = svg.querySelector(".ce-fixed-river-water [data-river-id='1']")!;
    expect(water).not.toBeNull();
    expect(svg.querySelectorAll("[data-facility-id]")).toHaveLength(0);
    const point = payload.rivers[0].rings[0][0];
    expect(
      polygonHitsDocumentWater(restored, [
        [point[0] - 1, point[1] - 1],
        [point[0] + 1, point[1] - 1],
        [point[0] + 1, point[1] + 1],
        [point[0] - 1, point[1] + 1]
      ])
    ).toBe(true);
    expect(worldContext.pack.burgs[1].x).toBe(100);
  });

  it("exports cell biome metadata in climate and biome properties", () => {
    const site = getBurgSiteDescriptor(1)!;
    expect(site.climate.biomeId).toBe(6);
    expect(site.climate.biomeKey).toBe("temperateDeciduousForest");
    expect(site.climate.biomeName).toBe("Temperate deciduous forest");
    expect(site.climate.biomeColor).toBe("#29bc56");

    expect(site.biome).toEqual({
      id: 6,
      key: "temperateDeciduousForest",
      name: "Temperate deciduous forest",
      color: "#29bc56",
      tags: ["forest", "arable"]
    });
  });

  it("round-trips certified regional water and rejects uncovered CE frames", () => {
    const burg = worldContext.pack.burgs[1];
    burg.cell = 4;
    burg.x = 99.5;
    burg.riverPlacement = {
      riverId: 1,
      bank: "right",
      widthMeters: 100,
      sourceSegmentId: 2,
      sourceParameter: 0.5
    } as typeof burg.riverPlacement;
    const descriptor = getBurgSiteDescriptor(1)!;
    const payload = descriptor.fixedCrossings!;
    expect(payload.schemaVersion).toBe(3);
    expect(payload.crossings).toEqual([]);
    expect(validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS)).toBe(true);
    expect(payload.rivers[0].sourceSegments!.length).toBeGreaterThan(0);
    const doc = createGridDocument({
      size: "small",
      extentMeters: descriptor.frame.extentMeters,
      cityRadiusMeters: descriptor.frame.cityRadiusMeters
    });
    applyImportedFixedCrossings(doc, descriptor as unknown as CESite);
    expect(parseDocument(JSON.stringify(doc))!.importedFixedCrossings).toEqual(payload);
    expect(renderStandaloneCitySvg(doc).querySelector(".ce-fixed-river-water [data-river-id='1']")).not.toBeNull();
    doc.frame.extentMeters *= 2;
    expect(parseDocument(JSON.stringify(doc))).toBeNull();
    expect(() => applyImportedFixedCrossings(doc, descriptor as unknown as CESite)).toThrow(RangeError);
    const invalid = structuredClone(payload);
    invalid.coverageBounds = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    expect(validFixedBurgCrossings(invalid, FIXED_SITE_CROSSING_BUDGETS)).toBe(false);
  });

  it("generates a compact town while preserving a distant canonical shoreline in the final frame", () => {
    const burg = worldContext.pack.burgs[1];
    burg.population = 0.1;
    worldContext.pack.cells.r[0] = 1;
    for (const cell of worldContext.pack.rivers[0].cells) worldContext.pack.cells.p[cell][0] = 101.4;
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.frame.cityRadiusMeters).toBe(80);
    expect(descriptor.fixedCrossings?.schemaVersion).toBe(2);
    const shared = decodeShare(encodeShare(shareFromDescriptor(descriptor)))!;
    expect(shared.patchParams?.nPatches).toBe(6);
    const document = createGridDocument({
      size: shared.size,
      grid: shared.grid,
      seed: shared.seed,
      patchParams: shared.patchParams,
      measureBlockSize: shared.measureBlockSize,
      ...descriptorFrameGridOptions(shared.descriptor!.frame)
    });
    const city = generateCityOnDocument(
      document,
      { ...defaultGenerationSettings(), descriptor: shared.descriptor },
      shared.seed
    )!;
    expect(city).not.toBeNull();
    expect(city.frame.extentMeters).toBe(descriptor.frame.extentMeters);
    expect(city.frame.cityRadiusMeters).toBe(80);
    expect(city.frame.settlementExtentMeters).toBe(300);
    const restored = parseDocument(JSON.stringify(city))!;
    expect(restored.importedFixedCrossings).toEqual(descriptor.fixedCrossings);
    const svg = renderStandaloneCitySvg(restored);
    const path = svg.querySelector(".ce-fixed-river-water [data-river-id='1']")!;
    expect(path.getAttribute("d")).toContain("M");
    const sourceRing = restored.importedFixedCrossings!.rivers[0].rings[0];
    expect(sourceRing.every(p => p[0] > 1300)).toBe(true);
    const buildings = buildBlockFabric(restored).buildings;
    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings.every(lot => !polygonHitsDocumentWater(restored, lot.polygon))).toBe(true);
  });

  it("keeps the actual frontage mandatory when callers also supply connection bounds", () => {
    worldContext.pack.burgs[1].population = 0.1;
    worldContext.pack.cells.r[0] = 1;
    for (const cell of worldContext.pack.rivers[0].cells) worldContext.pack.cells.p[cell][0] = 101.4;
    const requiredBounds = { minX: -30, minY: -10, maxX: 30, maxY: 10 };
    const descriptor = getBurgSiteDescriptor(1, { requiredBounds, maxExtentMeters: 4500 })!;
    expect(descriptor.frame.requiredBounds!.minX).toBe(-30);
    expect(descriptor.frame.requiredBounds!.maxX).toBeGreaterThan(1400);
    expect(descriptor.fixedCrossings?.schemaVersion).toBe(2);
    expect(requiredBounds).toEqual({ minX: -30, minY: -10, maxX: 30, maxY: 10 });
    expect(() => getBurgSiteDescriptor(1, { requiredBounds, maxExtentMeters: 1500 })).toThrow(
      "frontage exceeds extent budget"
    );
  });

  it("copies an optional fixed preview into the descriptor and rejects a different town origin", () => {
    const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const fixedCrossings = {
      schemaVersion: 1 as const,
      coordinateUnit: "metres" as const,
      revision: 0,
      originMeters: [100000, 100000] as [number, number],
      roadWidthMeters: 2,
      requiredBounds: bounds,
      rivers: [],
      crossings: []
    };
    const descriptor = getBurgSiteDescriptor(1, { requiredBounds: bounds, maxExtentMeters: 4500, fixedCrossings })!;
    expect(descriptor.fixedCrossings).toEqual(fixedCrossings);
    fixedCrossings.originMeters[0]++;
    expect(descriptor.fixedCrossings!.originMeters[0]).toBe(100000);
    expect(() => getBurgSiteDescriptor(1, { requiredBounds: bounds, maxExtentMeters: 4500, fixedCrossings })).toThrow(
      "origin or bounds mismatch"
    );
  });
  it("expands the physical display frame within an explicit budget and retains town size", () => {
    const original = getBurgSiteDescriptor(1)!;
    const requiredBounds = { minX: -2600, minY: -10, maxX: 100, maxY: 20 };
    const expanded = getBurgSiteDescriptor(1, { requiredBounds, maxExtentMeters: 6000 })!;
    expect(expanded.frame.extentMeters).toBe(5200);
    expect(expanded.frame.cityRadiusMeters).toBe(original.frame.cityRadiusMeters);
    expect(expanded.frame.originMapUnits).toEqual(original.frame.originMapUnits);
    expect(expanded.burg.population).toBe(original.burg.population);
    requiredBounds.minX = 0;
    expect(expanded.frame.requiredBounds!.minX).toBe(-2600);
    expect(() =>
      getBurgSiteDescriptor(1, { requiredBounds: { minX: -2600, minY: 0, maxX: 0, maxY: 0 }, maxExtentMeters: 4500 })
    ).toThrow("extent budget");
  });

  it("returns null for the placeholder and missing burgs", () => {
    expect(getBurgSiteDescriptor(0)).toBeNull();
    expect(getBurgSiteDescriptor(99)).toBeNull();
  });

  it("builds the local frame from population and map scale", () => {
    const descriptor = getBurgSiteDescriptor(1);
    expect(descriptor).not.toBeNull();
    const { frame, burg } = descriptor!;

    expect(burg.population).toBe(10000);
    expect(burg.dwellings).toBe(2223);
    expect(frame.metersPerMapUnit).toBe(1000);
    expect(frame.originMapUnits).toEqual([100, 100]);
    // 10 000 people at 150/ha → ~66.7 ha → r = sqrt(A/π) ≈ 461 m
    expect(frame.cityRadiusMeters).toBe(461);
    expect(frame.extentMeters).toBe(2766);
    expect(descriptor?.transport).toEqual({ maxBridgeCrossingMeters: 1000 });
  });

  it("exports the steam-era supported crossing allowance", () => {
    worldContext.options.historicalPeriod = "steamEra";
    expect(getBurgSiteDescriptor(1)?.transport).toEqual({ maxBridgeCrossingMeters: 2500 });
  });

  it("describes the river chord position, flow azimuth and bank side", () => {
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.rivers).toHaveLength(1);
    const river = descriptor.rivers[0];

    expect(river.riverId).toBe(1);
    expect(river.name).toBe("Testflow");
    // flows north → south, 200 m east of the town center
    expect(river.axisAzimuthDeg).toBe(180);
    expect(river.offsetMeters).toBeCloseTo(200, 0);
    expect(river.offsetRatio).toBeCloseTo(0.43, 2);
    expect(river.crossesSite).toBe(true);
    // looking downstream (south), the town center lies to the right (west)
    expect(river.cityBank).toBe("right");

    // the river does not flow through the burg's own cell → raw geometry, no snap
    expect(river.throughBurgCell).toBe(false);
    expect(river.snappedToBank).toBe(false);
    expect(river.rawOffsetMeters).toBe(river.offsetMeters);

    expect(river.segments).toHaveLength(1);
    const segment = river.segments[0];
    expect(segment.points.length).toBeGreaterThanOrEqual(2);
    expect(segment.points.length).toBe(segment.widthsMeters.length);
    const half = descriptor.frame.extentMeters / 2;
    for (const [x, y] of segment.points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(half + 0.1);
      expect(Math.abs(y)).toBeLessThanOrEqual(half + 0.1);
      expect(x).toBeCloseTo(200, 0);
    }
    for (const width of segment.widthsMeters) expect(width).toBeGreaterThanOrEqual(2);
    // upstream (north, +Y) first
    expect(segment.points[0][1]).toBeGreaterThan(segment.points.at(-1)![1]);
  });

  it("exports water contact even when the on-cell river is outside the city window", () => {
    worldContext.pack.cells.r[0] = 1;
    worldContext.pack.cells.fl[0] = 1000;
    const river = worldContext.pack.rivers[0];
    river.cellHydrology = {
      0: { waterDepth: 3.25, surfaceVelocity: 1.2, waterTemperature: 14 },
      6: { waterDepth: 8, surfaceVelocity: 2, waterTemperature: 15 }
    };
    const burg = worldContext.pack.burgs[1];
    burg.port = 1;
    burg.x = 1000;
    burg.y = 1000;
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.rivers).toHaveLength(1);
    expect(descriptor.rivers[0]).toMatchObject({
      segments: [],
      leftBankSegments: [],
      rightBankSegments: [],
      depthMeters: 3.25,
      hydrology: { cellId: 0, waterDepth: 3.25, surfaceVelocity: 1.2, waterTemperature: 14 },
      navigationVessel: { draftMeters: 0.8, beamMeters: 4, airDraftMeters: 4 },
      crossing: { depthMeters: 3.25, navigationRequired: true }
    });
    const ceSite = structuredClone(descriptor) as CESite;
    ceSite.roads = [
      {
        ...ceSite.roads[0],
        group: "roads",
        path: [
          [0, 0],
          [-ceSite.frame.extentMeters, 0]
        ]
      }
    ];
    const geo = siteToGeography(ceSite, true);
    expect(descriptor.rivers[0].frontage).toBe("beyond-budget");
    expect(geo.rivers).toHaveLength(0);
    expect(geo.channels ?? []).toHaveLength(0);
    expect(descriptor.burg.waterAccess).toMatchObject({ river: true, riverId: 1 });
    expect(burg.waterAccess).toEqual(descriptor.burg.waterAccess);
  });

  it("widens the display to a bank outside the population window without growing the town", () => {
    const burg = worldContext.pack.burgs[1];
    burg.cell = 4;
    burg.x = 98.2;
    const descriptor = getBurgSiteDescriptor(1)!;
    const population = populationWindowMeters(descriptor.frame.cityRadiusMeters);
    expect(descriptor.frame.cityRadiusMeters).toBe(461);
    expect(descriptor.burg.population).toBe(10000);
    expect(descriptor.frame.extentMeters).toBeGreaterThan(population);
    expect(descriptor.frame.extentMeters).toBeLessThanOrEqual(4500);
    expect(descriptor.frame.requiredBounds).toBeDefined();
    const river = descriptor.rivers[0];
    expect(river.frontage).toBeUndefined();
    expect(river.cityBank).toBe("right");
    const xs = [
      ...river.segments.flatMap(segment => segment.points.map(point => point[0])),
      ...river.leftBankSegments.flat().map(point => point[0]),
      ...river.rightBankSegments.flat().map(point => point[0])
    ];
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThan(500);
    const geo = siteToGeography(structuredClone(descriptor) as CESite);
    const shore =
      descriptor.fixedCrossings?.rivers[0]?.rings[0] ?? geo.channels?.[0]?.shoreline ?? geo.rivers[0]?.corridor ?? [];
    expect(shore.length).toBeGreaterThanOrEqual(2);
    expect(shore.every(point => point[0] > 500)).toBe(true);

    const document = createGridDocument({
      size: "large",
      grid: "evolution",
      seed: "frontage-window",
      ...descriptorFrameGridOptions(descriptor.frame)
    });
    expect(document.frame.extentMeters).toBe(descriptor.frame.extentMeters);
    expect(document.frame.settlementExtentMeters).toBe(population);
    expect(townExtentMeters(document.frame)).toBe(population);
    for (const vertex of Object.values(document.mesh.vertices)) {
      expect(Math.abs(vertex.point[0])).toBeLessThanOrEqual(population / 2 + 1);
      expect(Math.abs(vertex.point[1])).toBeLessThanOrEqual(population / 2 + 1);
    }
  });

  it("fits a wide river port by its near bank when the centreline exceeds the display budget", () => {
    const burg = worldContext.pack.burgs[1];
    burg.cell = 4;
    burg.x = 97.8;
    burg.port = 1;
    worldContext.pack.rivers[0].widthFactor = 8;
    const descriptor = getBurgSiteDescriptor(1)!;
    const river = descriptor.rivers[0];
    expect(river.frontage).toBeUndefined();
    expect(river.offsetMeters).toBeGreaterThan(2200);
    expect(descriptor.frame.cityRadiusMeters).toBe(461);
    expect(descriptor.frame.extentMeters).toBeGreaterThan(2766);
    expect(descriptor.frame.extentMeters).toBeLessThanOrEqual(4500);
    expect(descriptor.frame.extentMeters).toBeLessThan(river.offsetMeters * 2);
    const banks = [...river.leftBankSegments.flat(), ...river.rightBankSegments.flat()];
    expect(banks.length).toBeGreaterThan(1);
    expect(Math.min(...banks.map(point => point[0]))).toBeGreaterThan(500);
  });

  it("emits one gate-candidate entry per road leg with destinations", () => {
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.roads).toHaveLength(2);
    expect(descriptor.suggestedGates).toBe(2);

    const [east, west] = descriptor.roads;
    expect(east.entryAzimuthDeg).toBe(90);
    expect(east.group).toBe("roads");
    expect(east.reachesEdge).toBe(true);
    expect(east.nextBurg).toEqual(
      expect.objectContaining({
        id: 2,
        name: "Eastville",
        distanceMeters: 20000,
        scale: "village",
        role: "granary",
        isDomestic: true,
        diplomacyRelation: "domestic"
      })
    );
    expect(east.path[0]).toEqual([0, 0]);

    expect(west.entryAzimuthDeg).toBe(270);
    expect(west.nextBurg).toBeNull();

    expect(countBurgRoadLegs(worldContext.pack.burgs[1])).toBe(2);
  });

  it("classifies the site and reports flat terrain", () => {
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.suggestedArchetype).toBe("riverCrossing");
    expect(descriptor.waterbody).toBeNull();

    const { terrain } = descriptor;
    // h=25, exponent 1.8 → (25-18)^1.8 ≈ 33 m
    expect(terrain.elevationMeters).toBe(33);
    expect(terrain.gradePercent).toBe(0);
    expect(terrain.downhillAzimuthDeg).toBeNull();
    expect(terrain.heightfield.size).toBe(17);
    expect(terrain.heightfield.elevationsMeters).toHaveLength(17 * 17);
    expect(terrain.heightfield.waterMask.every(mask => mask === 0)).toBe(true);
  });

  it("preserves on-cell river coordinates rather than moving it independently of roads", () => {
    // Relocate the burg onto a river cell, offset 0.3 map units (300 m) east of
    // the centerline — mimicking FMG's shift of river burgs toward the drawn bank.
    const burg = worldContext.pack.burgs[1];
    burg.cell = 4;
    burg.x = 100.5;
    burg.y = 100;

    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.rivers).toHaveLength(1);
    const river = descriptor.rivers[0];

    expect(river.throughBurgCell).toBe(true);
    expect(river.snappedToBank).toBe(false);
    expect(river.rawOffsetMeters).toBeCloseTo(300, 0);
    expect(river.offsetMeters).toBe(river.rawOffsetMeters);
    expect(river.crossesSite).toBe(true);
    // town east of the southward-flowing river → left bank, flow azimuth unchanged
    expect(river.cityBank).toBe("left");
    expect(river.axisAzimuthDeg).toBe(180);
  });

  it("keeps the river but drops crossesSite when the town shrinks away from it", () => {
    worldContext.pack.burgs[1].population = 0.1; // 100 people → radius clamps small
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.rivers).toHaveLength(1);
    expect(descriptor.rivers[0].crossesSite).toBe(false);
    expect(descriptor.rivers[0].offsetRatio).toBeGreaterThan(1);
    // no crossing river → falls back to crossroads on flat terrain
    expect(descriptor.suggestedArchetype).toBe("crossroads");
  });

  it("interpolates the closest-point width instead of using the upstream vertex", () => {
    worldContext.pack.burgs[1].y = 98;
    worldContext.pack.cells.fl[4] = 2000;
    const river = getBurgSiteDescriptor(1)!.rivers[0];
    const segment = river.segments[0];
    const i = segment.points.findIndex(
      (p, index) => index + 1 < segment.points.length && p[1] >= 0 && segment.points[index + 1][1] <= 0
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const t = segment.points[i][1] / (segment.points[i][1] - segment.points[i + 1][1]);
    expect(river.widthMeters).toBeCloseTo(
      segment.widthsMeters[i] + (segment.widthsMeters[i + 1] - segment.widthsMeters[i]) * t,
      0
    );
    expect(river.widthMeters).not.toBe(segment.widthsMeters[i]);
  });

  it("uses the same map scale for river widths, centreline and physical banks", () => {
    const baseline = getBurgSiteDescriptor(1)!.rivers[0];
    worldContext.distanceScale = 4;
    const scaled = getBurgSiteDescriptor(1)!.rivers[0];

    expect(scaled.widthMeters).toBeCloseTo(baseline.widthMeters * 4, 0);
    expect(scaled.rawOffsetMeters).toBeCloseTo(baseline.rawOffsetMeters * 4, 0);
    expect(scaled.leftBankSegments.some(segment => segment.length >= 2)).toBe(true);
    expect(scaled.rightBankSegments.some(segment => segment.length >= 2)).toBe(true);
    expect(scaled.parentRiverId).toBeNull();
  });
});
