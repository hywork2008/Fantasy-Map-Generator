import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { bestRoute, computeDirections, resolveBurg, splitTravelDuration } from "./travelDirections";

// Burg A(0) and B(2) are linked by two land routes: a short but very steep pass through
// waypoint X(1), and a longer but flat detour through waypoints Y(3)/Z(4). Burgs C(5)/D(6) are
// isolated (no route at all). Ports E(7)/F(9) are linked only by a sea route via water cell 8.
function makePack(): PackedGraph {
  const cells = {
    p: [
      [0, 0], // 0: burg A
      [10, 0], // 1: X, steep peak
      [20, 0], // 2: burg B
      [5, 15], // 3: Y, flat detour waypoint
      [15, 15], // 4: Z, flat detour waypoint
      [100, 100], // 5: burg C, isolated
      [110, 100], // 6: burg D, isolated
      [0, 50], // 7: port E
      [10, 50], // 8: water waypoint
      [20, 50] // 9: port F
    ],
    h: [25, 95, 25, 25, 25, 25, 25, 25, 10, 25]
  };

  const burgs = [
    { cell: 0, x: 0, y: 0, name: "", removed: true }, // index 0 sentinel — never referenced
    { cell: 0, x: 0, y: 0, name: "A" },
    { cell: 2, x: 20, y: 0, name: "B" },
    { cell: 5, x: 100, y: 100, name: "C" },
    { cell: 6, x: 110, y: 100, name: "D" },
    { cell: 7, x: 0, y: 50, name: "E" },
    { cell: 9, x: 20, y: 50, name: "F" }
  ];

  const routes = [
    {
      i: 0,
      group: "roads",
      feature: 1,
      points: [
        [0, 0, 0],
        [10, 0, 1],
        [20, 0, 2]
      ]
    },
    {
      i: 1,
      group: "roads",
      feature: 1,
      points: [
        [0, 0, 0],
        [5, 15, 3],
        [15, 15, 4],
        [20, 0, 2]
      ]
    },
    {
      i: 2,
      group: "searoutes",
      feature: 1,
      points: [
        [0, 50, 7],
        [10, 50, 8],
        [20, 50, 9]
      ]
    }
  ];

  return { cells, burgs, routes } as unknown as PackedGraph;
}

beforeEach(() => {
  worldContext.pack = makePack();
  worldContext.distanceScale = 1;
  useOptionsState.setState({ heightExponent: 1.8 });
});

describe("computeDirections", () => {
  it("offers a shortest/steep route and a longer/easier route for foot and wagon", () => {
    const result = computeDirections(1, 2);
    expect(result).not.toBeNull();

    for (const mode of ["foot", "wagon"] as const) {
      const modeResult = result![mode];
      expect(modeResult.available).toBe(true);
      if (!modeResult.available) continue;

      expect(modeResult.routes).toHaveLength(2);
      const shortest = modeResult.routes.find(r => r.labelKey === "shortest");
      const easier = modeResult.routes.find(r => r.labelKey === "easier");
      expect(shortest?.cells).toEqual([0, 1, 2]);
      expect(easier?.cells).toEqual([0, 3, 4, 2]);

      // The steep pass is dramatically slower despite being shorter in distance.
      expect(shortest!.distanceKm).toBeLessThan(easier!.distanceKm);
      expect(easier!.durationDays).toBeLessThan(shortest!.durationDays);
      expect(shortest!.ascentM).toBeGreaterThan(0);

      // Faster alternate leads the list.
      expect(modeResult.routes[0].labelKey).toBe("easier");
    }
  });

  it("reports ship unavailable between two inland burgs", () => {
    const result = computeDirections(1, 2)!;
    expect(result.ship).toEqual({ available: false, reasonKey: "noSeaRoute" });
  });

  it("reports every mode unavailable between two burgs with no connecting network", () => {
    const result = computeDirections(3, 4)!;
    expect(result.foot).toEqual({ available: false, reasonKey: "noLandRoute" });
    expect(result.wagon).toEqual({ available: false, reasonKey: "noLandRoute" });
    expect(result.ship).toEqual({ available: false, reasonKey: "noSeaRoute" });
  });

  it("finds a single ship route between two ports and reports land modes unavailable", () => {
    const result = computeDirections(5, 6)!;
    expect(result.foot).toEqual({ available: false, reasonKey: "noLandRoute" });
    expect(result.wagon).toEqual({ available: false, reasonKey: "noLandRoute" });
    expect(result.ship.available).toBe(true);
    if (result.ship.available) {
      expect(result.ship.routes).toHaveLength(1);
      expect(result.ship.routes[0].cells).toEqual([7, 8, 9]);
      expect(result.ship.routes[0].gradeProfile).toBeNull();
      expect(result.ship.routes[0].durationDays).toBeGreaterThan(0);
    }
  });

  it("reports sameLocation for every mode when both burgs share a location", () => {
    const result = computeDirections(1, 1)!;
    expect(result.foot).toEqual({ available: false, reasonKey: "sameLocation" });
    expect(result.wagon).toEqual({ available: false, reasonKey: "sameLocation" });
    expect(result.ship).toEqual({ available: false, reasonKey: "sameLocation" });
  });

  it("returns null when either burg id doesn't resolve", () => {
    expect(computeDirections(1, 999)).toBeNull();
    expect(computeDirections(0, 2)).toBeNull();
  });
});

describe("resolveBurg", () => {
  it("resolves a live burg and rejects id 0, unknown ids, and removed burgs", () => {
    expect(resolveBurg(1)?.name).toBe("A");
    expect(resolveBurg(0)).toBeNull();
    expect(resolveBurg(999)).toBeNull();
    expect(resolveBurg(null)).toBeNull();
  });
});

describe("splitTravelDuration", () => {
  it("splits a continuous day count into days/hours/minutes", () => {
    expect(splitTravelDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(splitTravelDuration(1)).toEqual({ days: 1, hours: 0, minutes: 0 });
    expect(splitTravelDuration(1.5)).toEqual({ days: 1, hours: 12, minutes: 0 });
    expect(splitTravelDuration(30 / (24 * 60))).toEqual({ days: 0, hours: 0, minutes: 30 });
  });

  it("treats non-finite or non-positive input as zero", () => {
    expect(splitTravelDuration(Infinity)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(splitTravelDuration(-1)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(splitTravelDuration(NaN)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe("bestRoute", () => {
  it("picks the lowest-duration route and returns null when unavailable", () => {
    const result = computeDirections(1, 2)!;
    const best = bestRoute(result.foot);
    expect(best?.labelKey).toBe("easier");
    expect(bestRoute({ available: false, reasonKey: "noLandRoute" })).toBeNull();
  });
});
