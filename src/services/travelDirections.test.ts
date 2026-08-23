import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { computeDirections, pickDefaultMode, resolveBurg, splitTravelDuration } from "./travelDirections";

// Fixture geometry (all distanceScale = 1, so map units == km):
//
// - Burg A(0) / B(2): linked by two land routes — a short but very steep pass through waypoint
//   X(1), and a longer but flat detour through waypoints Y(3)/Z(4). Tests grade-aware routing.
// - Burg C(5) / D(6): isolated, no route at all.
// - Burg A2(9) / B2(10): linked by a long (1000 unit) flat land-only detour through W1(11)/W2(12),
//   AND a much faster land+sea shortcut (50 land + 300 sea + 50 land) via two ports, 7 and 8.
//   Tests automatic sea use and the avoidSea fallback.
// - Burg PortE(13) / PortF(15): linked only by a sea route via water cell 14. Tests
//   seaRequiredDespiteAvoid when avoidSea can't be honored at all.
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
      [50, 1000], // 7: port near A2
      [350, 1000], // 8: port near B2
      [0, 1000], // 9: burg A2
      [400, 1000], // 10: burg B2
      [0, 700], // 11: W1, long land detour waypoint
      [400, 700], // 12: W2, long land detour waypoint
      [0, 50], // 13: burg PortE
      [10, 50], // 14: water waypoint
      [20, 50] // 15: burg PortF
    ],
    h: [25, 95, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 10, 25]
  };

  const burgs = [
    { cell: 0, x: 0, y: 0, name: "", removed: true }, // index 0 sentinel — never referenced
    { cell: 0, x: 0, y: 0, name: "A" },
    { cell: 2, x: 20, y: 0, name: "B" },
    { cell: 5, x: 100, y: 100, name: "C" },
    { cell: 6, x: 110, y: 100, name: "D" },
    { cell: 9, x: 0, y: 1000, name: "A2" },
    { cell: 10, x: 400, y: 1000, name: "B2" },
    { cell: 13, x: 0, y: 50, name: "PortE" },
    { cell: 15, x: 20, y: 50, name: "PortF" }
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
      group: "roads",
      feature: 1,
      points: [
        [0, 1000, 9],
        [50, 1000, 7]
      ]
    },
    {
      i: 3,
      group: "roads",
      feature: 1,
      points: [
        [350, 1000, 8],
        [400, 1000, 10]
      ]
    },
    {
      i: 4,
      group: "roads",
      feature: 1,
      points: [
        [0, 1000, 9],
        [0, 700, 11],
        [400, 700, 12],
        [400, 1000, 10]
      ]
    },
    {
      i: 5,
      group: "searoutes",
      feature: 1,
      points: [
        [50, 1000, 7],
        [350, 1000, 8]
      ]
    },
    {
      i: 6,
      group: "searoutes",
      feature: 1,
      points: [
        [0, 50, 13],
        [10, 50, 14],
        [20, 50, 15]
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
  it("picks the grade-aware fastest land route, avoiding a shorter but very steep pass", () => {
    const result = computeDirections(1, 2);
    expect(result).not.toBeNull();

    for (const mode of ["foot", "mounted", "wagon"] as const) {
      const modeResult = result![mode];
      expect(modeResult.available).toBe(true);
      if (!modeResult.available) continue;

      expect(modeResult.route.cells).toEqual([0, 3, 4, 2]); // the flat detour, not the steep pass
      expect(modeResult.route.composition).toBe("land");
      expect(modeResult.route.gradeProfile).not.toBeNull();
      expect(modeResult.route.ascentM).toBe(0);
      expect(modeResult.route.seaDistanceKm).toBe(0);
      expect(modeResult.route.seaRequiredDespiteAvoid).toBe(false);
    }
  });

  it("reports every mode unavailable between two burgs with no connecting network", () => {
    const result = computeDirections(3, 4)!;
    expect(result.foot).toEqual({ available: false, reasonKey: "noRoute" });
    expect(result.mounted).toEqual({ available: false, reasonKey: "noRoute" });
    expect(result.wagon).toEqual({ available: false, reasonKey: "noRoute" });
  });

  it("automatically combines land and sea when that's faster than a long land-only detour", () => {
    const result = computeDirections(5, 6)!;
    expect(result.wagon.available).toBe(true);
    if (!result.wagon.available) return;

    const route = result.wagon.route;
    expect(route.composition).toBe("mixed");
    expect(route.cells).toEqual([9, 7, 8, 10]);
    expect(route.kinds).toEqual(["land", "sea", "land"]);
    expect(route.landDistanceKm).toBeCloseTo(100, 6);
    expect(route.seaDistanceKm).toBeCloseTo(300, 6);
    expect(route.distanceKm).toBeCloseTo(400, 6);
    // 100/32 (land) + 300/60 (sea) + 2 transitions * 2-day port penalty.
    expect(route.durationDays).toBeCloseTo(100 / 32 + 300 / 60 + 4, 6);
    expect(route.gradeProfile).toBeNull(); // not an all-land route
    expect(route.seaRequiredDespiteAvoid).toBe(false);
  });

  it("falls back to the long land-only detour when avoidSea is set and a land path exists", () => {
    const result = computeDirections(5, 6, true)!;
    expect(result.wagon.available).toBe(true);
    if (!result.wagon.available) return;

    const route = result.wagon.route;
    expect(route.composition).toBe("land");
    expect(route.cells).toEqual([9, 11, 12, 10]);
    expect(route.seaDistanceKm).toBe(0);
    expect(route.durationDays).toBeCloseTo(1000 / 32, 6); // no port-transfer penalty
    expect(route.seaRequiredDespiteAvoid).toBe(false); // avoidSea was honorable, so it wasn't overridden
  });

  it("ignores avoidSea when only a sea route connects the two burgs", () => {
    const withSea = computeDirections(7, 8, false)!;
    expect(withSea.wagon.available).toBe(true);
    if (withSea.wagon.available) {
      expect(withSea.wagon.route.composition).toBe("sea");
      expect(withSea.wagon.route.cells).toEqual([13, 14, 15]);
      expect(withSea.wagon.route.seaRequiredDespiteAvoid).toBe(false);
    }

    const avoided = computeDirections(7, 8, true)!;
    expect(avoided.wagon.available).toBe(true);
    if (avoided.wagon.available) {
      expect(avoided.wagon.route.composition).toBe("sea");
      expect(avoided.wagon.route.seaRequiredDespiteAvoid).toBe(true);
    }
  });

  it("reports sameLocation for every mode when both burgs share a location", () => {
    const result = computeDirections(1, 1)!;
    expect(result.foot).toEqual({ available: false, reasonKey: "sameLocation" });
    expect(result.mounted).toEqual({ available: false, reasonKey: "sameLocation" });
    expect(result.wagon).toEqual({ available: false, reasonKey: "sameLocation" });
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

describe("pickDefaultMode", () => {
  it("picks the fastest available mode (mounted, over the flat land detour)", () => {
    const result = computeDirections(1, 2)!;
    expect(pickDefaultMode(result)).toBe("mounted"); // fastest base speed on an all-flat route
  });

  it("returns null when every mode is unavailable", () => {
    const result = computeDirections(3, 4)!;
    expect(pickDefaultMode(result)).toBeNull();
  });
});
