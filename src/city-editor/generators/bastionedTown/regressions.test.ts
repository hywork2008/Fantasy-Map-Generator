import { describe, expect, it, vi } from "vitest";
import { clipDitchChunk } from "../../../city3d/three/terrainFieldMesh";
import { parseDocument } from "../../services/io/documentCodec";
import type { BastionedTownPlan, CityDocument, Point } from "../../types/document";
import { createGridDocument } from "../document";
import { generateCityOnDocument } from "../generation/generateCity";
import { defaultGenerationSettings } from "../generation/settings";
import type { SkeletonInputs } from "../generation/skeleton/contracts";
import { prepareSkeletonRun } from "../generation/skeleton/toPlan";
import { pointInPolygon } from "../geom";
import * as lotGeometry from "../lotGeometry";
import { synthSite } from "../site/synthSite";
import { classifyTownWater, townGroundPolygons } from "../townWater";
import { cutDitchGround } from "./ditchGeometry";
import { bastionedEditRejection } from "./edit";
import { polygonsOverlap } from "./geometry";
import { MAX_FORTRESS_EVALUATIONS, planBastionedTown } from "./plan";
import { polygonReserved } from "./reserve";
import { defenseBand } from "./waterGap";

function settings() {
  const s = defaultGenerationSettings();
  s.config = structuredClone(s.config);
  Object.assign(s.config, { rivers: [], coast: "none", relief: false });
  Object.assign(s.config.features, { walls: true, citadel: false });
  return {
    ...s,
    generationMethod: "skeleton-first" as const,
    wallShape: "bastioned" as const,
    walledAreaShare: 1,
    historicalPeriod: "ageOfExploration" as const,
    townFortification: {
      kind: "bastioned" as const,
      outworks: "ravelins" as const,
      ditch: "dry" as const,
      streetPlan: "radial" as const
    }
  };
}
function grid(seed: string, radius = 100, extent = 900) {
  return createGridDocument({ size: "tiny", grid: "evolution", seed, extentMeters: extent, cityRadiusMeters: radius });
}

const square: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10]
];
const bandOuter: Point[] = [
  [-1, -1],
  [11, -1],
  [11, 11],
  [-1, 11]
];

describe("fortress review regressions", () => {
  it("triangulates an unchanged river outline only once", () => {
    const vertices = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `r${i}`,
        { id: `r${i}`, point: [i * 2, 10 * Math.sin(i / 10)], locked: false }
      ])
    );
    const doc = {
      frame: { extentMeters: 300 },
      mesh: { vertices, edges: {}, faces: {} },
      featureGroups: [{ id: "river", kind: "river", vertices: Object.keys(vertices), style: { widthMeters: 4 } }]
    } as unknown as CityDocument;
    const spy = vi.spyOn(lotGeometry, "triangularInfillParts");
    try {
      expect(classifyTownWater(doc).parts).toHaveLength(1);
      expect(spy.mock.calls.filter(([ring]) => ring.length === 120)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
  it("does not restore wet edges when a dry band wraps around vertex zero", () => {
    const inputs = {
      water: [
        {
          kind: "channel",
          polygon: [
            [9, 4],
            [12, 4],
            [12, 6],
            [9, 6]
          ]
        }
      ],
      rivers: []
    } as unknown as SkeletonInputs;
    const parts = defenseBand(square, bandOuter, inputs)!;
    expect(parts).toHaveLength(1);
    expect(parts.some(p => pointInPolygon([10.5, 5], p.outer))).toBe(false);
    expect(parts.some(p => pointInPolygon([-0.5, 5], p.outer))).toBe(true);
  });

  it("reserves crossing and containing lots, but leaves holes buildable", () => {
    const rampart: Point[] = [
      [4, -5],
      [5, -5],
      [5, 5],
      [4, 5]
    ];
    const town = {
      bastions: [],
      curtains: [{ rampart }],
      outworks: [],
      ditches: [],
      coveredWays: [],
      glacis: []
    } as unknown as BastionedTownPlan;
    const crossing: Point[] = [
      [-10, 2],
      [10, 2],
      [10, 4],
      [-10, 4]
    ];
    expect(polygonsOverlap(crossing, rampart)).toBe(true);
    expect(polygonReserved(town, crossing)).toBe(true);
    expect(
      polygonReserved(town, [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10]
      ])
    ).toBe(true);
    const holed = { ...town, curtains: [], glacis: [[{ outer: bandOuter, holes: [square] }]] };
    expect(
      polygonReserved(holed, [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4]
      ])
    ).toBe(false);
  });

  it("cuts excavation footprints out of flat ground and field triangles", () => {
    const plan = { ditches: [{ region: [{ outer: bandOuter, holes: [square] }] }] } as BastionedTownPlan;
    const ground: Point[] = [
      [-5, -5],
      [15, -5],
      [15, 15],
      [-5, 15]
    ];
    const pieces = cutDitchGround(plan, ground);
    const covers = (p: Point) => pieces.some(piece => pointInPolygon(p, piece));
    expect(covers([5, -0.5])).toBe(false);
    expect(covers([5, 4])).toBe(true);
    const doc = { frame: { extentMeters: 40 }, mesh: { faces: {} }, bastionedTown: plan } as CityDocument;
    const land = townGroundPolygons(doc, { parts: [], reserved: [], landRefill: [] }).land;
    expect(land.some(p => pointInPolygon([5, -0.5], p))).toBe(false);
    const chunk = clipDitchChunk(
      {
        positions: Float32Array.from(ground.flatMap(p => [p[0], p[0] * 0.1, -p[1]])),
        colors: new Float32Array(12).fill(0.5),
        indices: Uint32Array.from([0, 1, 2, 0, 2, 3])
      },
      plan
    );
    for (let i = 0; i < chunk.positions.length; i += 9) {
      const tri: Point[] = [0, 3, 6].map(j => [chunk.positions[i + j], -chunk.positions[i + j + 2]]);
      expect(pointInPolygon([5, -0.5], tri)).toBe(false);
    }
    for (let i = 0; i < chunk.positions.length; i += 3)
      expect(chunk.positions[i + 1]).toBeCloseTo(chunk.positions[i] * 0.1);
  });

  it("bounds actual facility evaluations, including changes of glacis width", () => {
    const result = planBastionedTown(grid("fortress-tight", 198, 600), settings(), "fortress-tight");
    expect("failure" in result && result.failure.reason).toBe("fortress-insufficient-space");
    expect("failure" in result && result.failure.evaluations).toBe(MAX_FORTRESS_EVALUATIONS);
  });

  it("preserves imported fixed approaches through the frame boundary", () => {
    const seed = "fortress-inland",
      s = settings(),
      input = grid(seed);
    const descriptor = synthSite("largeTown", s.config, seed, { extentMeters: 900, cityRadiusMeters: 100 });
    const imported = { ...s, descriptor };
    const { inputs } = prepareSkeletonRun(input, imported, seed, { skipUnsupported: true });
    const city = generateCityOnDocument(input, imported, seed)!;
    expect(city).not.toBeNull();
    for (const road of inputs.roads) {
      expect(road.fixed).toBe(true);
      const group = city.featureGroups.find(g => g.id === `gc:road-${road.id}`);
      expect(group?.kind).toBe("road");
      if (group?.kind !== "road") continue;
      const points = group.segments.flatMap(ref => {
        const e = city.mesh.edges[ref.edgeId];
        return [city.mesh.vertices[e.a].point, city.mesh.vertices[e.b].point];
      });
      const end = road.path.at(-1)!;
      expect(Math.min(...points.map(p => Math.hypot(p[0] - end[0], p[1] - end[1])))).toBeLessThan(1e-4);
    }
    expect(parseDocument(JSON.stringify(city))).not.toBeNull();
    const moved = structuredClone(city);
    const ref = moved.featureGroups.find(g => g.id === "gc:wall-0");
    if (ref?.kind === "wall") {
      const edge = moved.mesh.edges[ref.segments[0].edgeId];
      const point = moved.mesh.vertices[edge.a].point,
        other = moved.mesh.vertices[edge.b].point;
      const dx = other[0] - point[0],
        dy = other[1] - point[1],
        length = Math.hypot(dx, dy);
      point[0] -= (dy / length) * 20;
      point[1] += (dx / length) * 20;
    }
    expect(bastionedEditRejection(city, moved)).toBe(true);
    expect(parseDocument(JSON.stringify(moved))).toBeNull();
    const badEdges = structuredClone(city);
    badEdges.bastionedTown!.curtains[0].wallEdgeIds = [...badEdges.bastionedTown!.bastions[0].wallEdgeIds];
    expect(parseDocument(JSON.stringify(badEdges))).toBeNull();
    for (const field of ["gateId", "roadId"] as const) {
      const bad = structuredClone(city);
      bad.bastionedTown!.accesses.find(a => a.role === "civic")![field] = "missing";
      expect(parseDocument(JSON.stringify(bad))).toBeNull();
    }
  }, 30000);

  it("connects the citadel gate to the town road network", () => {
    const s = settings();
    s.config.features.citadel = true;
    const city = generateCityOnDocument(grid("fortress-citadel"), s, "fortress-citadel")!;
    expect(city).not.toBeNull();
    const gate = city.gates.find(g => g.ownerCastleId)!;
    const graph = new Map<string, Set<string>>();
    for (const g of city.featureGroups) {
      if (g.kind !== "road") continue;
      for (const ref of g.segments) {
        const e = city.mesh.edges[ref.edgeId];
        for (const [a, b] of [
          [e.a, e.b],
          [e.b, e.a]
        ]) {
          if (!graph.has(a)) graph.set(a, new Set());
          graph.get(a)!.add(b);
        }
      }
    }
    const seen = new Set([gate.vertexId]),
      queue = [gate.vertexId];
    while (queue.length)
      for (const v of graph.get(queue.pop()!) ?? [])
        if (!seen.has(v)) {
          seen.add(v);
          queue.push(v);
        }
    expect(city.gates.filter(g => g.role === "town").every(g => seen.has(g.vertexId))).toBe(true);
  }, 30000);
});
