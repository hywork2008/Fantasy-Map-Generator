import { describe, expect, it } from "vitest";
import type { Point } from "../../../types/geometry";
import { pointInPolygon } from "../../geom";
import { checkSkeleton } from "./checkSkeleton";
import { dryCore, planSkeletonCore } from "./cityCore";
import type { SkeletonCore, SkeletonInputs, SkeletonRoute, SkeletonWall } from "./contracts";
import { planSkeletonCrossings } from "./crossings";
import { dryRuns } from "./inputs";
import { planSkeleton } from "./pipeline";
import { closeCorridor, lineAngleDegrees, sub } from "./vector";
import { bastionEra, planSkeletonWall, resolveWallShape } from "./wallShapes";

const HALF = 600;

function inputs(overrides: Partial<SkeletonInputs> = {}): SkeletonInputs {
  const road = (dir: Point, id: number) => ({
    id,
    path: [
      [0, 0],
      [dir[0] * HALF, dir[1] * HALF]
    ] as Point[],
    fixed: false,
    reachesFrame: true
  });
  return {
    half: HALF,
    cellSize: 50,
    core: [0, 0],
    cityRadius: 360,
    walls: true,
    walledAreaShare: 1,
    water: [],
    rivers: [],
    roads: [road([1, 0], 0), road([-1, 0], 1), road([0, 1], 2), road([0, -1], 3)],
    fixedBridges: [],
    bridgeSkewLimit: 15,
    bastionEra: false,
    requiredExternalRoads: 2,
    wallWidth: 7,
    minGateSpacing: 40,
    ...overrides
  };
}

/** A straight north–south river through the centre. */
const throughRiver = {
  index: 0,
  centerline: [
    [30, -HALF],
    [30, HALF]
  ] as Point[],
  halfWidth: 8
};
/** Sea north of y = 250. */
const northSea = {
  kind: "sea" as const,
  polygon: [
    [-HALF, 250],
    [HALF, 250],
    [HALF, HALF],
    [-HALF, HALF]
  ] as Point[]
};

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe("skeleton K1 helpers", () => {
  it("closes a coast corridor on its water side", () => {
    const ring = closeCorridor(
      [
        [-HALF, 100],
        [HALF, 100]
      ],
      [0, 1],
      HALF
    )!;
    expect(pointInPolygon([0, 300], ring)).toBe(true);
    expect(pointInPolygon([0, -300], ring)).toBe(false);
  });

  it("cuts a line exactly at the shore", () => {
    const runs = dryRuns(
      [
        [0, 0],
        [0, 500]
      ],
      [northSea]
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].at(-1)![1]).toBeCloseTo(250, 6);
  });

  it("moves a centre that lies in the sea onto dry land", () => {
    const core = dryCore(inputs({ core: [0, 260], water: [northSea] }))!;
    expect(pointInPolygon(core, northSea.polygon)).toBe(false);
    expect(core[1]).toBeLessThan(250 - 50 + 1e-6);
  });
});

describe("skeleton K3–K4", () => {
  it("builds a square wall whose river crossing is square to the river", () => {
    const base = inputs({ rivers: [throughRiver] });
    const core = planSkeletonCore(base) as SkeletonCore;
    const wall = planSkeletonWall(base, core, "square", 4, rng(7));
    expect(wall.waterGates).toHaveLength(2);
    for (const gate of wall.waterGates) {
      const a = wall.polygon[gate.edge];
      const b = wall.polygon[(gate.edge + 1) % wall.polygon.length];
      // The river runs north–south, so its normal is east–west.
      expect(lineAngleDegrees(sub(b, a), [1, 0])).toBeLessThan(0.5);
    }
  });

  it("straightens an oblique bridge to within the skew limit", () => {
    const diagonal = {
      id: 0,
      path: [
        [0, 0],
        [HALF, HALF * 0.6]
      ] as Point[],
      fixed: false,
      reachesFrame: true
    };
    const base = inputs({
      walls: false,
      rivers: [
        {
          index: 0,
          centerline: [
            [200, -HALF],
            [200, HALF]
          ],
          halfWidth: 8
        }
      ],
      roads: [diagonal]
    });
    const { bridges } = planSkeletonCrossings(base, [0, 0], null);
    expect(bridges).toHaveLength(1);
    expect(bridges[0].straightened).toBe(true);
    expect(bridges[0].skewDegrees).toBeLessThanOrEqual(base.bridgeSkewLimit);
  });

  it("is deterministic for the same seed", () => {
    const base = inputs({ rivers: [throughRiver] });
    expect(JSON.stringify(planSkeleton(base, {}, "s1"))).toBe(JSON.stringify(planSkeleton(base, {}, "s1")));
  });
});

describe("skeleton K5 checks", () => {
  const ring: Point[] = [
    [-200, -200],
    [200, -200],
    [200, 200],
    [-200, 200]
  ];
  const wall: SkeletonWall = { shape: "square", sides: 4, polygon: ring, waterGates: [] };
  const coreOf = (base: SkeletonInputs) => planSkeletonCore(base) as SkeletonCore;
  const route = (id: number, path: Point[], gateIndex: number | null): SkeletonRoute => ({
    id,
    path,
    gateIndex,
    reachesFrame: true,
    dropped: false
  });

  it("accepts a plain inland skeleton", () => {
    const result = planSkeleton(inputs(), { wallShape: "round" }, "plain");
    expect(result.skeleton).not.toBeNull();
    expect(result.skeleton!.gates.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a wall running along a river", () => {
    const base = inputs({
      rivers: [
        {
          index: 0,
          centerline: [
            [-HALF, 203],
            [HALF, 203]
          ],
          halfWidth: 6
        }
      ]
    });
    const failure = checkSkeleton({
      inputs: base,
      core: { ...coreOf(base), edgeRivers: [] },
      wall,
      routes: [],
      gates: [],
      bridges: []
    });
    expect(failure?.reason).toBe("wall-river-parallel");
  });

  it("rejects a bridge beyond the era's skew limit", () => {
    const base = inputs({ walls: false });
    const failure = checkSkeleton({
      inputs: base,
      core: coreOf(base),
      wall: null,
      routes: [
        route(
          0,
          [
            [0, 0],
            [HALF, HALF]
          ],
          null
        )
      ],
      gates: [],
      bridges: [{ roadId: 0, riverIndex: 0, point: [100, 100], skewDegrees: 40, straightened: false }]
    });
    expect(failure?.reason).toBe("bridge-skew");
  });

  it("rejects a gate that opens onto the sea", () => {
    const base = inputs({
      water: [
        {
          kind: "sea",
          polygon: [
            [-HALF, 205],
            [HALF, 205],
            [HALF, HALF],
            [-HALF, HALF]
          ]
        }
      ]
    });
    const failure = checkSkeleton({
      inputs: base,
      core: coreOf(base),
      wall,
      routes: [
        route(
          0,
          [
            [0, 0],
            [0, 200]
          ],
          0
        )
      ],
      gates: [{ point: [0, 200], edge: 2, outward: [0, 1], roadIds: [0] }],
      bridges: []
    });
    expect(failure?.reason).toBe("gate-unreachable-outside");
  });

  it("rejects too few external roads", () => {
    const base = inputs();
    const failure = checkSkeleton({
      inputs: base,
      core: coreOf(base),
      wall,
      routes: [
        route(
          0,
          [
            [0, 0],
            [200, 0],
            [HALF, 0]
          ],
          0
        )
      ],
      gates: [{ point: [200, 0], edge: 1, outward: [1, 0], roadIds: [0] }],
      bridges: []
    });
    expect(failure?.reason).toBe("too-few-external-roads");
  });
});

describe("bastioned walls (S4)", () => {
  it("draws bastioned from auto only in the age of exploration or later", () => {
    expect(bastionEra("lateMedieval")).toBe(false);
    expect(bastionEra("ageOfExploration")).toBe(true);
    expect(bastionEra(undefined)).toBe(true);
    const draw = (era: boolean) =>
      Array.from({ length: 200 }, (_, i) => {
        const x = i / 200 + 0.0025;
        return resolveWallShape("auto", () => x, era);
      });
    expect(draw(false)).not.toContain("bastioned");
    expect(draw(true)).toContain("bastioned");
  });

  it("builds a simple star trace with gates mid-curtain", () => {
    const result = planSkeleton(inputs({ bastionEra: true }), { wallShape: "bastioned", wallSides: 6 }, "star");
    expect(result.skeleton).not.toBeNull();
    const wall = result.skeleton!.wall!;
    expect(wall.shape).toBe("bastioned");
    expect(wall.sides).toBe(6);
    // Five vertices per bastion survive simplification on dry land.
    expect(wall.polygon.length).toBeGreaterThanOrEqual(30);
    expect(wall.curtainMidpoints).toHaveLength(6);
    for (const gate of result.skeleton!.gates)
      expect(
        Math.min(...wall.curtainMidpoints!.map(m => Math.hypot(m[0] - gate.point[0], m[1] - gate.point[1])))
      ).toBeLessThan(1);
  });
});
