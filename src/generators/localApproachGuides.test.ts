import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import { WorldRiverGeometryRegistry, type WorldRiverGeometrySettings } from "../services/worldRiverGeometry";
import { type ApproachCorridorSettings, findApproachCorridor } from "./approachCorridorSearch";
import { buildLocalApproachGuides, type LocalApproachGuideSettings } from "./localApproachGuides";
import { createProvisionalRiverCrossing } from "./riverCrossingCandidates";
import {
  connectWorldRiverCrossingApproaches,
  type WorldCrossingApproachSettings
} from "./worldRiverCrossingApproaches";

const guides: LocalApproachGuideSettings = {
  spacingMeters: 10,
  paddingMeters: 20,
  terminalLeadMeters: 10,
  connectorRadiusMeters: 15,
  maxSamples: 1000,
  maxNodes: 1000,
  maxEdges: 10000,
  maxEdgeChecks: 10000
};
const corridor: ApproachCorridorSettings = {
  roadWidthMeters: 2,
  minimumTurnRadiusMeters: 2,
  minimumStraightMeters: 0,
  minimumFinalStraightMeters: 2,
  turnPenaltyMetersPerRadian: 0,
  maxEnvelopeErrorMeters: 0.05,
  maxArcSections: 100,
  maxNodes: 1000,
  maxEdges: 10000,
  maxLabels: 20000,
  maxExpansions: 20000
};
function water(polygons: PhysicalWaterPolygon[] = []) {
  const result = PhysicalWaterIndex.build(polygons, new PhysicalWaterValidationCache());
  if (!result) throw new Error("fixture");
  return result;
}
function box(x: number, y: number, w: number, h: number): PhysicalWaterPolygon {
  return {
    id: 99,
    rings: [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ]
    ]
  };
}
function input() {
  return {
    start: [-50, 0] as RiverPoint,
    goal: [0, 0] as RiverPoint,
    goalTangent: [1, 0] as RiverPoint,
    roadWidthMeters: 2,
    settings: guides,
    water: water(),
    supportsDryFootprint: () => true
  };
}
function search(i = input()) {
  const build = buildLocalApproachGuides(i);
  expect(build).toHaveProperty("guides");
  if (!("guides" in build)) throw new Error(build.reason);
  const result = findApproachCorridor({
    ...i,
    ...build.guides,
    goalNodeId: build.guides.approachNodeId,
    settings: corridor
  });
  return { build, result };
}

describe("bounded physical approach guide construction", () => {
  it("connects an off-grid start to fixed E with an axis-aligned final edge", () => {
    const i = { ...input(), start: [-47, 3] as RiverPoint };
    const { build, result } = search(i);
    expect(result).toHaveProperty("corridor");
    expect(build.guides.nodes.find(n => n.id === 1)).toEqual({ id: 1, point: [0, 0], neighbors: [] });
    expect(build.guides.nodes.filter(n => n.neighbors.includes(1)).map(n => n.id)).toEqual([2]);
    if ("corridor" in result) {
      expect(result.corridor.pieces.at(-1)?.end).toEqual([0, 0]);
      expect(result.corridor.pieces.at(-1)?.kind).toBe("line");
    }
  });
  it("finds a dry curved detour instead of connecting through a pond", () => {
    const i = { ...input(), water: water([box(-35, -5, 10, 10)]) };
    const { build, result } = search(i);
    expect(result).toHaveProperty("corridor");
    for (const n of build.guides.nodes)
      for (const id of n.neighbors) {
        const other = build.guides.nodes.find(m => m.id === id)!;
        expect(Math.hypot(other.point[0] - n.point[0], other.point[1] - n.point[1])).toBeGreaterThan(0);
      }
    if ("corridor" in result) {
      expect(result.corridor.pieces.some(p => p.kind === "arc")).toBe(true);
      expect(result.corridor.distanceMeters).toBeGreaterThan(50);
    }
  });
  it("keeps opposite dry regions disconnected even with no cell-bank labels", () => {
    const i = { ...input(), water: water([box(-30, -100, 5, 200)]) };
    const { result } = search(i);
    expect(result).toMatchObject({ reason: "no-corridor" });
  });
  it("fixes the first edge direction for an existing-road attachment", () => {
    const i = { ...input(), startTangent: [0, 1] as RiverPoint };
    const { build, result } = search(i);
    expect(build.guides.nodes.find(n => n.id === 0)?.neighbors).toEqual([3]);
    expect(build.guides.nodes.find(n => n.id === 3)?.point).toEqual([-50, 10]);
    expect(result).toHaveProperty("corridor");
  });
  it("reports sample, node, edge and edge-check budgets distinctly", () => {
    const i = input();
    for (const [settings, reason] of [
      [{ ...guides, maxSamples: 1 }, "sample-budget"],
      [{ ...guides, maxNodes: 3 }, "graph-budget"],
      [{ ...guides, maxEdges: 1 }, "graph-budget"],
      [{ ...guides, maxEdgeChecks: 1 }, "edge-budget"]
    ] as const)
      expect(buildLocalApproachGuides({ ...i, settings })).toMatchObject({ reason });
    expect(buildLocalApproachGuides({ ...i, settings: { ...guides, spacingMeters: 0 } })).toMatchObject({
      reason: "invalid-input"
    });
  });
  it("rejects wet, unsupported and numerically collapsed terminal footprints", () => {
    expect(buildLocalApproachGuides({ ...input(), water: water([box(-1, -1, 2, 2)]) })).toMatchObject({
      reason: "blocked-terminal"
    });
    expect(buildLocalApproachGuides({ ...input(), supportsDryFootprint: () => false })).toMatchObject({
      reason: "blocked-terminal"
    });
    expect(
      buildLocalApproachGuides({
        ...input(),
        start: [1e20, 1e20],
        goal: [1e20, 1e20],
        settings: { ...guides, spacingMeters: 1e5, terminalLeadMeters: 1e5 }
      })
    ).toMatchObject({ reason: "blocked-terminal" });
  });
  it("is deterministic, leaves inputs untouched and consumes no RNG", () => {
    const i = input(),
      before = structuredClone(i.settings);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      expect(buildLocalApproachGuides(i)).toEqual(buildLocalApproachGuides(i));
      expect(i.settings).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });
  it("preserves the lattice path under rotation, translation and uniform scaling", () => {
    const base = search().result;
    const angle = 0.41;
    const rotate = (p: RiverPoint): RiverPoint => [
      p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
      p[0] * Math.sin(angle) + p[1] * Math.cos(angle)
    ];
    const transform = (p: RiverPoint): RiverPoint => {
      const r = rotate(p);
      return [r[0] * 2 + 400, r[1] * 2 + 300];
    };
    const i = {
      ...input(),
      start: transform([-50, 0]),
      goal: transform([0, 0]),
      goalTangent: rotate([1, 0]),
      roadWidthMeters: 4,
      settings: { ...guides, spacingMeters: 20, paddingMeters: 40, terminalLeadMeters: 20, connectorRadiusMeters: 30 }
    };
    const build = buildLocalApproachGuides(i);
    expect(build).toHaveProperty("guides");
    if (!("guides" in build)) throw new Error(build.reason);
    const result = findApproachCorridor({
      ...i,
      ...build.guides,
      goalNodeId: 1,
      settings: {
        ...corridor,
        roadWidthMeters: 4,
        minimumTurnRadiusMeters: 4,
        minimumFinalStraightMeters: 4,
        maxEnvelopeErrorMeters: 0.1
      }
    });
    expect(result).toHaveProperty("corridor");
    if ("corridor" in result && "corridor" in base)
      expect(result.corridor.distanceMeters).toBeCloseTo(base.corridor.distanceMeters * 2, 8);
  });
});

const geometry: WorldRiverGeometrySettings = {
  curveAlpha: 0.1,
  precision: { arcToleranceMeters: 1e-5, maxIntegrationDepth: 24, maxEvaluations: 100000 },
  banks: { maxStepMeters: 10, maxChordErrorMeters: 0.01, maxSamples: 2000 },
  maxSourcePoints: 100
};
function worldFixture() {
  const world = {
    distanceScale: 0.001,
    graphWidth: 100,
    graphHeight: 100,
    pack: {
      cells: {
        p: [
          [50, 40],
          [50, 44],
          [50, 48],
          [50, 52],
          [50, 56],
          [50, 60]
        ],
        h: [25, 25, 25, 25, 25, 25],
        fl: [20, 20, 20, 20, 20, 20]
      },
      rivers: [{ i: 7, cells: [0, 1, 2, 3, 4, 5], widthFactor: 0, sourceWidth: 2 }],
      burgs: [{}, { i: 1, x: 85, y: 50, cell: 0 }, { i: 2, x: 15, y: 50, cell: 0 }],
      routes: []
    }
  } as unknown as WorldContext;
  const registry = new WorldRiverGeometryRegistry();
  const g = registry.get(world, world.pack.rivers[0], "km", geometry);
  if (!("geometry" in g)) throw new Error(g.reason);
  const settings: WorldCrossingApproachSettings = {
    geometry,
    dimensions: { bankSeatMeters: 2, straightApproachMeters: 5, roadWidthMeters: 2, localWindowMeters: 2 },
    guides: { ...guides, spacingMeters: 5, paddingMeters: 10, terminalLeadMeters: 5, connectorRadiusMeters: 8 },
    corridor,
    maxRivers: 10
  };
  const env = {
    nonRiverWater: [] as PhysicalWaterPolygon[],
    supportsDryFootprint: () => true,
    capabilityAt: () => ({ depthMeters: 3 })
  };
  const candidate = createProvisionalRiverCrossing({
    id: 5,
    geometry: g.geometry,
    arcLengthMeters: 10,
    dimensions: settings.dimensions,
    otherWater: [],
    capability: env.capabilityAt(),
    supportsDryFootprint: env.supportsDryFootprint
  });
  if (!("candidate" in candidate)) throw new Error(candidate.reason);
  const run = () =>
    connectWorldRiverCrossingApproaches(world, "km", candidate.candidate, 1, 2, settings, env, registry);
  return { world, registry, settings, env, crossing: candidate.candidate, run };
}
describe("world city-to-E approach gate", () => {
  it("connects two world cities without moving cities or the provisional bridge", () => {
    const f = worldFixture(),
      before = structuredClone(f.world),
      c = structuredClone(f.crossing);
    const result = f.run();
    expect(result).toHaveProperty("result.status", "approaches-validated");
    expect(f.world).toEqual(before);
    expect(f.crossing).toEqual(c);
    if ("result" in result && "status" in result.result) {
      expect(result.result.approachA.pieces[0].start).toEqual([85, 50]);
      expect(result.result.approachB.pieces[0].start).toEqual([15, 50]);
    }
  });
  it("does not infer bank connectivity from the shared city cell", () => {
    const f = worldFixture();
    f.world.pack.burgs[1].x = 15;
    // Extend water to both map edges so the guide cannot walk around a river end.
    f.env.nonRiverWater = [box(49, 0, 2, 40), box(49, 60, 2, 40)];
    const r = f.run();
    expect(r).toHaveProperty("result.reason", "approach-unresolved");
  });
  it("blocks unresolved water and stale geometry instead of using partial obstacles", () => {
    const f = worldFixture();
    f.world.pack.rivers.push({ ...f.world.pack.rivers[0], i: 8, cells: [99, 100] });
    expect(f.run()).toMatchObject({ reason: "unresolved-water" });
    f.world.pack.rivers.pop();
    f.world.pack.rivers[0].sourceWidth = 3;
    expect(f.run()).toMatchObject({ reason: "stale-crossing" });
  });
  it("checks city identity, removal, map bounds, width and river budgets", () => {
    const f = worldFixture();
    f.world.pack.burgs[1].removed = true;
    expect(f.run()).toMatchObject({ reason: "invalid-city" });
    f.world.pack.burgs[1].removed = false;
    f.world.pack.burgs[1].x = 0;
    expect(f.run()).toMatchObject({ reason: "guide-unresolved", build: { reason: "blocked-terminal" } });
    f.world.pack.burgs[1].x = 85;
    f.settings.corridor = { ...corridor, roadWidthMeters: 3 };
    expect(f.run()).toMatchObject({ reason: "invalid-settings" });
    f.settings.corridor = corridor;
    f.settings.maxRivers = 0;
    expect(f.run()).toMatchObject({ reason: "invalid-settings" });
  });
  it("includes supplied lake obstacles and passes full footprints to terrain evaluation", () => {
    const f = worldFixture();
    f.env.nonRiverWater = [box(80, 45, 10, 10)];
    expect(f.run()).toMatchObject({ reason: "guide-unresolved", side: "A", build: { reason: "blocked-terminal" } });
    f.env.nonRiverWater = [];
    f.env.supportsDryFootprint = () => false;
    expect(f.run()).toMatchObject({ reason: "invalid-crossing" });
  });
  it("rejects displaced bridge endpoints before spending a guide budget", () => {
    const f = worldFixture();
    f.crossing.approachA[1] += 1;
    f.settings.guides.maxSamples = 1;
    expect(f.run()).toMatchObject({ reason: "invalid-crossing" });
  });
});
