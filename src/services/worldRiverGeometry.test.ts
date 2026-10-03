import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { Rivers } from "../generators/river-generator";
import {
  generateWorldRiverCrossingCandidates,
  type WorldCrossingCandidateEnvironment,
  type WorldCrossingCandidateSettings
} from "../generators/worldRiverCrossingCandidates";
import type { River } from "../types/models";
import { physicalRiverWidth, riverDisplayOffset } from "../utils/riverShape";
import {
  buildWorldRiverGeometry,
  WorldRiverGeometryRegistry,
  type WorldRiverGeometrySettings
} from "./worldRiverGeometry";

const settings: WorldRiverGeometrySettings = {
  curveAlpha: 0.1,
  precision: { arcToleranceMeters: 1e-5, maxIntegrationDepth: 24, maxEvaluations: 100000 },
  banks: { maxStepMeters: 2000, maxChordErrorMeters: 0.01, maxSamples: 2000 },
  maxSourcePoints: 100
};
function fixture(): WorldContext {
  return {
    distanceScale: 1,
    graphWidth: 100,
    graphHeight: 100,
    pack: {
      cells: {
        p: [
          [20, 20],
          [20, 24],
          [20, 28],
          [20, 32],
          [20, 36],
          [20, 40]
        ],
        h: [25, 25, 25, 25, 25, 25],
        fl: [20, 20, 20, 20, 20, 20]
      },
      rivers: [{ i: 7, cells: [0, 1, 2, 3, 4, 5], widthFactor: 0, sourceWidth: 0.4 }],
      routes: []
    }
  } as unknown as WorldContext;
}
function built(world = fixture()) {
  const result = buildWorldRiverGeometry(world, world.pack.rivers[0], "km", 3, settings);
  expect(result).toHaveProperty("geometry");
  if (!("geometry" in result)) throw new Error(result.reason);
  return result;
}
const candidateSettings: WorldCrossingCandidateSettings = {
  geometry: settings,
  dimensions: { bankSeatMeters: 2, straightApproachMeters: 20, roadWidthMeters: 2, localWindowMeters: 100 },
  spacingMeters: 4000,
  maxRivers: 20,
  maxAttempts: 20,
  firstCandidateId: 100
};
const environment = { nonRiverWater: [], supportsDryFootprint: () => true, capabilityAt: () => ({ depthMeters: 3 }) };

function enumerateFixture(
  world: WorldContext,
  distanceUnit: string,
  config: WorldCrossingCandidateSettings,
  env: WorldCrossingCandidateEnvironment
) {
  return generateWorldRiverCrossingCandidates(world, distanceUnit, config, env, new WorldRiverGeometryRegistry());
}

describe("world physical river construction", () => {
  it("recovers a small river without points, converts units once and preserves the world", () => {
    const world = fixture(),
      before = structuredClone(world);
    const g = built(world);
    expect(g.source).toBe("cells");
    expect(g.geometry.axis.length).toBeCloseTo(20000, 5);
    expect(g.metersPerMapUnit).toBe(1000);
    expect(g.geometry.axis.geometryVersion).toBe(3);
    expect(g.bounds).toEqual({ minX: 19955, maxX: 20045, minY: 20000, maxY: 40000 });
    expect(g.geometry.water.bankReferences![0].some(r => r !== null && Math.abs(r.arcStart - 4000) < 1e-5)).toBe(true);
    expect(world).toEqual(before);
  });
  it("uses matching explicit points without reading the global Rivers context", () => {
    const world = fixture();
    world.pack.rivers[0].points = world.pack.cells.p.map(([x, y]) => [x + 10, y]);
    const spy = vi.spyOn(Rivers, "addMeandering").mockImplementation(() => {
      throw new Error("singleton called");
    });
    try {
      expect(built(world).bounds.minX).toBe(29955);
      expect(built(world).source).toBe("points");
    } finally {
      spy.mockRestore();
    }
  });
  it("recovers mismatched points from cells with a diagnostic, but rejects nonfinite matching points", () => {
    const world = fixture();
    world.pack.rivers[0].points = [[99, 99]];
    expect(built(world).warnings).toEqual(["points-length-mismatch"]);
    world.pack.rivers[0].points = world.pack.cells.p.map(p => [...p]);
    world.pack.rivers[0].points[2][0] = NaN;
    expect(buildWorldRiverGeometry(world, world.pack.rivers[0], "km", 3, settings)).toMatchObject({
      reason: "invalid-source"
    });
  });
  it("uses the supplied world's dimensions for a border mouth", () => {
    const world = fixture();
    world.pack.rivers[0].cells.push(-1);
    world.graphHeight = 42;
    const g = built(world);
    expect(g.bounds.maxY).toBe(42000);
    expect(g.geometry.axis.length).toBeCloseTo(22000, 5);
    world.pack.rivers[0].cells = [-1, 0];
    expect(buildWorldRiverGeometry(world, world.pack.rivers[0], "km", 3, settings)).toMatchObject({
      reason: "invalid-source"
    });
  });
  it("matches existing flux/width progression without a render sample-count dependency", () => {
    const world = fixture();
    world.pack.rivers[0].widthFactor = 1;
    const g = built(world);
    const offsets = Array.from({ length: 6 }, (_, i) =>
      riverDisplayOffset({ flux: 20, pointIndex: i, widthFactor: 1, startingWidth: 0.4 })
    );
    for (let i = 0; i < offsets.length; i++)
      expect(offsets[i]).toBe(Rivers.getOffset({ flux: 20, pointIndex: i, widthFactor: 1, startingWidth: 0.4 }));
    expect(physicalRiverWidth(offsets.at(-1)!)).toBe(Rivers.getWidth(offsets.at(-1)!));
    expect(g.bounds.maxX - 20000).toBe(physicalRiverWidth(offsets.at(-1)!) * 500);
  });
  it("uses equivalent metre scales consistently across km and miles", () => {
    const world = fixture(),
      km = built(world);
    world.distanceScale = 1000 / 1609.344;
    const miles = buildWorldRiverGeometry(world, world.pack.rivers[0], "mi", 3, settings);
    expect(miles).toHaveProperty("geometry");
    if (!("geometry" in miles)) return;
    expect(miles.geometry).toEqual(km.geometry);
  });
  it("reports bad cells, zero rounded width, bad scales and source budgets", () => {
    const world = fixture();
    world.pack.rivers[0].cells[2] = 999;
    expect(buildWorldRiverGeometry(world, world.pack.rivers[0], "km", 3, settings)).toMatchObject({
      reason: "invalid-source"
    });
    const zero = fixture();
    zero.pack.rivers[0].sourceWidth = 0;
    expect(buildWorldRiverGeometry(zero, zero.pack.rivers[0], "km", 3, settings)).toMatchObject({
      reason: "invalid-width"
    });
    const scale = fixture();
    scale.distanceScale = 0;
    expect(buildWorldRiverGeometry(scale, scale.pack.rivers[0], "km", 3, settings)).toMatchObject({
      reason: "invalid-scale"
    });
    const good = fixture();
    expect(
      buildWorldRiverGeometry(good, good.pack.rivers[0], "km", 3, { ...settings, maxSourcePoints: 5 })
    ).toMatchObject({ reason: "source-budget" });
  });
});

describe("world geometry version cache", () => {
  it("reuses immutable success and invalidates changed points, widths and settings", () => {
    const world = fixture(),
      registry = new WorldRiverGeometryRegistry();
    const a = registry.get(world, world.pack.rivers[0], "km", settings);
    expect(registry.get(world, world.pack.rivers[0], "km", settings)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    world.pack.cells.p[2][1] += 0.1;
    const b = registry.get(world, world.pack.rivers[0], "km", settings);
    expect(b.geometryVersion).toBeGreaterThan(a.geometryVersion);
    world.pack.rivers[0].sourceWidth = 0.5;
    const c = registry.get(world, world.pack.rivers[0], "km", settings);
    expect(c.geometryVersion).toBeGreaterThan(b.geometryVersion);
    const d = registry.get(world, world.pack.rivers[0], "km", {
      ...settings,
      banks: { ...settings.banks, maxStepMeters: 1000 }
    });
    expect(d.geometryVersion).toBeGreaterThan(c.geometryVersion);
    expect(registry.stats).toEqual({ builds: 4, cacheHits: 1 });
  });
  it("invalidates cached failures when repaired, isolates worlds and does not reuse a replaced pack's version", () => {
    const world = fixture(),
      registry = new WorldRiverGeometryRegistry();
    world.pack.rivers[0].sourceWidth = 0;
    const failure = registry.get(world, world.pack.rivers[0], "km", settings);
    expect(registry.get(world, world.pack.rivers[0], "km", settings)).toBe(failure);
    world.pack.rivers[0].sourceWidth = 0.4;
    const repaired = registry.get(world, world.pack.rivers[0], "km", settings);
    expect(repaired).toHaveProperty("geometry");
    expect(repaired.geometryVersion).toBeGreaterThan(failure.geometryVersion);
    const other = fixture();
    other.pack.cells.p = other.pack.cells.p.map(([x, y]) => [x + 10, y]);
    const separate = registry.get(other, other.pack.rivers[0], "km", settings);
    expect(separate.geometryVersion).toBeGreaterThan(repaired.geometryVersion);
    world.pack = fixture().pack;
    expect(registry.get(world, world.pack.rivers[0], "km", settings).geometryVersion).toBeGreaterThan(
      separate.geometryVersion
    );
  });
});

describe("bounded world crossing enumeration", () => {
  it("connects cells-only geometry to perpendicular provisional candidates without RNG or world writes", () => {
    const world = fixture(),
      before = structuredClone(world),
      random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("world RNG");
      });
    try {
      const report = enumerateFixture(world, "km", candidateSettings, environment);
      expect(report.status).toBe("complete");
      expect(report.attempts).toBe(5);
      expect(report.candidates).toHaveLength(5);
      expect(report.candidates[0]).toMatchObject({
        id: 100,
        riverId: 7,
        status: "provisional",
        tRiver: [0, 1],
        waterDistanceMeters: 90
      });
      expect(report.nextCandidateId).toBe(105);
      expect(world).toEqual(before);
      expect(enumerateFixture(world, "km", candidateSettings, environment)).toEqual(report);
    } finally {
      random.mockRestore();
    }
  });
  it("distinguishes attempt/river budgets from unresolved water and never grants partial success", () => {
    const world = fixture();
    const budget = enumerateFixture(world, "km", { ...candidateSettings, maxAttempts: 2 }, environment);
    expect(budget.status).toBe("attempt-budget");
    expect(budget.attempts).toBe(2);
    expect(budget.nextCandidateId).toBe(102);
    world.pack.rivers.push({ ...world.pack.rivers[0], i: 8, cells: [999, 1000] });
    const unresolved = enumerateFixture(world, "km", candidateSettings, environment);
    expect(unresolved.status).toBe("unresolved-water");
    expect(unresolved.candidates).toHaveLength(0);
    expect(enumerateFixture(world, "km", { ...candidateSettings, maxRivers: 1 }, environment).status).toBe(
      "river-budget"
    );
  });
  it("collects vessel requirements before selection and keeps rejected ID allocations", () => {
    const world = fixture();
    const report = enumerateFixture(world, "km", candidateSettings, {
      ...environment,
      capabilityAt: () => ({ depthMeters: 0.5, transport: { maxBridgeCrossingMeters: 10 } })
    });
    expect(report.candidates).toHaveLength(0);
    expect(report.rejected).toHaveLength(5);
    expect(report.rejected[0]).toMatchObject({ candidateId: 100, reason: "bridge-unavailable" });
    expect(report.nextCandidateId).toBe(105);
  });
  it("rejects duplicate river IDs and invalid allocation/settings", () => {
    const world = fixture();
    world.pack.rivers.push({ ...world.pack.rivers[0] } as River);
    expect(enumerateFixture(world, "km", candidateSettings, environment).status).toBe("unresolved-water");
    expect(enumerateFixture(fixture(), "km", { ...candidateSettings, spacingMeters: 0 }, environment).status).toBe(
      "invalid-settings"
    );
  });
  it("allocates a bounded round-robin attempt to each river in stable ID order", () => {
    const world = fixture();
    world.pack.cells.p.push(...world.pack.cells.p.map(([x, y]) => [x + 30, y] as [number, number]));
    world.pack.cells.fl = new Uint16Array(Array(12).fill(20));
    world.pack.cells.h = new Uint8Array(Array(12).fill(25));
    world.pack.rivers.push({ ...world.pack.rivers[0], i: 3, cells: [6, 7, 8, 9, 10, 11] });
    const limited = { ...candidateSettings, maxAttempts: 2 };
    const a = enumerateFixture(world, "km", limited, environment);
    expect(a.status).toBe("attempt-budget");
    expect(a.candidates.map(c => c.riverId)).toEqual([3, 7]);
    world.pack.rivers.reverse();
    expect(enumerateFixture(world, "km", limited, environment)).toEqual(a);
  });
  it("includes physical lake/sea obstacles and rejects malformed obstacle inputs", () => {
    const lake = {
      id: 1,
      rings: [
        [
          [20046, 22099],
          [20060, 22099],
          [20060, 22101],
          [20046, 22101]
        ]
      ] as const
    };
    const report = enumerateFixture(fixture(), "km", candidateSettings, {
      ...environment,
      nonRiverWater: [lake]
    });
    expect(report.rejected[0]).toMatchObject({ candidateId: 100, reason: "wet-approach" });
    expect(report.candidates.some(c => c.id === 100)).toBe(false);
    expect(
      enumerateFixture(fixture(), "km", candidateSettings, {
        ...environment,
        nonRiverWater: [{ id: 1, rings: [] }]
      }).status
    ).toBe("unresolved-water");
  });
  it("reuses the caller's session registry for repeated world enumeration", () => {
    const world = fixture(),
      registry = new WorldRiverGeometryRegistry();
    const a = generateWorldRiverCrossingCandidates(world, "km", candidateSettings, environment, registry);
    const b = generateWorldRiverCrossingCandidates(world, "km", candidateSettings, environment, registry);
    expect(b.geometries[0]).toBe(a.geometries[0]);
    expect(b.candidates).toEqual(a.candidates);
    expect(registry.stats).toEqual({ builds: 1, cacheHits: 1 });
  });
});
