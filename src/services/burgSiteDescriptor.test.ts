import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { countBurgRoadLegs, getBurgSiteDescriptor } from "./burgSiteDescriptor";

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
      biome: new Uint8Array(cellCount).fill(6),
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

  it("returns null for the placeholder and missing burgs", () => {
    expect(getBurgSiteDescriptor(0)).toBeNull();
    expect(getBurgSiteDescriptor(99)).toBeNull();
  });

  it("builds the local frame from population and map scale", () => {
    const descriptor = getBurgSiteDescriptor(1);
    expect(descriptor).not.toBeNull();
    const { frame, burg } = descriptor!;

    expect(burg.population).toBe(10000);
    expect(frame.metersPerMapUnit).toBe(1000);
    expect(frame.originMapUnits).toEqual([100, 100]);
    // 10 000 people at 150/ha → ~66.7 ha → r = sqrt(A/π) ≈ 461 m
    expect(frame.cityRadiusMeters).toBe(461);
    expect(frame.extentMeters).toBe(2766);
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

  it("emits one gate-candidate entry per road leg with destinations", () => {
    const descriptor = getBurgSiteDescriptor(1)!;
    expect(descriptor.roads).toHaveLength(2);
    expect(descriptor.suggestedGates).toBe(2);

    const [east, west] = descriptor.roads;
    expect(east.entryAzimuthDeg).toBe(90);
    expect(east.group).toBe("roads");
    expect(east.reachesEdge).toBe(true);
    expect(east.nextBurg).toEqual({ id: 2, name: "Eastville", distanceMeters: 20000 });
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

  it("snaps an on-cell river to the town bank in true-width space", () => {
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
    expect(river.snappedToBank).toBe(true);
    expect(river.rawOffsetMeters).toBeCloseTo(300, 0);
    // snapped so the town center sits on the bank: trueWidth/2 + min(150, 0.3 × radius)
    const expectedOffset = river.widthMeters / 2 + 0.3 * descriptor.frame.cityRadiusMeters;
    expect(river.offsetMeters).toBeCloseTo(expectedOffset, 0);
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
});
