import { describe, expect, it } from "vitest";
import { heightToMeters } from "../utils/height";
import {
  buildRouteGradeProfile,
  buildRouteGradeProfileFromPoints,
  DEFAULT_ROUTE_GRADE_THRESHOLDS,
  passClassLabel,
  sampleEdgeGrade,
  tagsForPass
} from "./routeGrade";

/** Build a dense heights array with given cell→h entries (others 0). */
function heightsFrom(map: Record<number, number>, size = 32): Float64Array {
  const h = new Float64Array(size);
  for (const [k, v] of Object.entries(map)) h[Number(k)] = v;
  return h;
}

describe("heightToMeters", () => {
  it("returns 0 below land baseline", () => {
    expect(heightToMeters(0, 1.8)).toBe(0);
    expect(heightToMeters(19, 1.8)).toBe(0);
  });

  it("matches historical (h-18)**exponent for land", () => {
    expect(heightToMeters(20, 1)).toBe(2);
    expect(heightToMeters(38, 1)).toBe(20);
    expect(heightToMeters(28, 2)).toBe(100); // (10)^2
  });
});

describe("sampleEdgeGrade", () => {
  it("computes grade ≈ 0.15 for 150 m rise over 1 km", () => {
    // exp=1: heightToMeters(h)=h-18 for h≥20. Rise 150 m ⇒ Δh=150 (values may exceed pack 0–100 range).
    const heights = heightsFrom({ 0: 20, 1: 170 }, 4);
    const edge = sampleEdgeGrade(0, 1, 1, {
      distanceScale: 1,
      heightExponent: 1,
      heights
    });
    expect(edge.runKm).toBe(1);
    expect(edge.riseM).toBeCloseTo(150, 6);
    expect(edge.grade).toBeCloseTo(0.15, 6);
    expect(edge.absGrade).toBeCloseTo(0.15, 6);
  });

  it("returns grade 0 for tiny runKm", () => {
    const heights = heightsFrom({ 0: 20, 1: 80 }, 4);
    const edge = sampleEdgeGrade(0, 1, 0.01, {
      distanceScale: 1,
      heightExponent: 1,
      heights
    });
    expect(edge.runKm).toBeCloseTo(0.01);
    expect(edge.grade).toBe(0);
    expect(edge.absGrade).toBe(0);
  });
});

describe("buildRouteGradeProfile", () => {
  const baseOpts = {
    distanceScale: 1,
    heightExponent: 1
  };

  it("flat: same h, 100 map units → grade 0, worst flat, no passes", () => {
    const heights = heightsFrom({ 0: 25, 1: 25 }, 4);
    const profile = buildRouteGradeProfile([0, 1], [100], { ...baseOpts, heights });
    expect(profile.planarKm).toBe(100);
    expect(profile.maxAbsGrade).toBe(0);
    expect(profile.worstClass).toBe("flat");
    expect(profile.passes).toEqual([]);
    expect(profile.totalAscentM).toBe(0);
    expect(profile.totalDescentM).toBe(0);
  });

  it("single steep edge at 15% qualifies as hardPass (L_hard=0.3)", () => {
    // rise 150 m over 1 km → grade 0.15
    const heights = heightsFrom({ 0: 20, 1: 170 }, 4);
    const profile = buildRouteGradeProfile([0, 1], [1], { ...baseOpts, heights });
    expect(profile.maxAbsGrade).toBeCloseTo(0.15, 5);
    expect(profile.worstClass).toBe("hardPass");
    expect(profile.passes.some(p => p.class === "hardPass")).toBe(true);
    expect(profile.passes[0]?.tags).toContain("horseHard");
    expect(profile.passes[0]?.tags).toContain("wagonHard");
  });

  it("gentle long climb hits hardPass via ascent window (not grade)", () => {
    // 3 km, +250 m total, uniform — grade = 250/3000 ≈ 0.0833 < G_hard (0.15) and < G_steep (0.10)
    // Single edge of 3 km is enough for W_hard window.
    const heights = heightsFrom({ 0: 20, 1: 270 }, 4); // riseM = 250 with exp=1
    const profile = buildRouteGradeProfile([0, 1], [3], { ...baseOpts, heights });
    expect(profile.maxAbsGrade).toBeLessThan(DEFAULT_ROUTE_GRADE_THRESHOLDS.G_steep);
    expect(profile.totalAscentM).toBeCloseTo(250, 5);
    expect(profile.worstClass).toBe("hardPass");
    expect(profile.passes.some(p => p.class === "hardPass")).toBe(true);
  });

  it("extreme grade threshold sets worstClass extreme", () => {
    // grade ≥ 0.22: 220 m / 1 km
    const heights = heightsFrom({ 0: 20, 1: 240 }, 4);
    const profile = buildRouteGradeProfile([0, 1], [1], { ...baseOpts, heights });
    expect(profile.maxAbsGrade).toBeCloseTo(0.22, 5);
    expect(profile.worstClass).toBe("extreme");
  });

  it("thresholds override lowers G_hard so mild grade becomes hardPass", () => {
    // grade = 0.08 over 1 km
    const heights = heightsFrom({ 0: 20, 1: 100 }, 4); // rise 80 m
    const mild = buildRouteGradeProfile([0, 1], [1], { ...baseOpts, heights });
    expect(mild.maxAbsGrade).toBeCloseTo(0.08, 5);
    // Without override: below steep/hard continuous thresholds → flat or rolling
    expect(["flat", "rolling"]).toContain(mild.worstClass);

    const forced = buildRouteGradeProfile([0, 1], [1], {
      ...baseOpts,
      heights,
      thresholds: { G_hard: 0.05, L_hardKm: 0.1 }
    });
    expect(forced.worstClass).toBe("hardPass");
  });

  it("empty / single cell returns empty profile without throwing", () => {
    const heights = heightsFrom({ 0: 25 }, 2);
    expect(buildRouteGradeProfile([], [], { ...baseOpts, heights })).toMatchObject({
      planarKm: 0,
      worstClass: "flat",
      edges: [],
      passes: []
    });
    expect(buildRouteGradeProfile([0], [], { ...baseOpts, heights })).toMatchObject({
      planarKm: 0,
      worstClass: "flat"
    });
    // length mismatch
    expect(buildRouteGradeProfile([0, 1], [1, 2], { ...baseOpts, heights })).toMatchObject({
      planarKm: 0,
      worstClass: "flat"
    });
  });

  it("rolling worstClass when maxAbsGrade ≥ G_rolling but no steep+ pass", () => {
    // grade 0.06 over short edge 0.2 km — below L_steep, above G_rolling
    const heights = heightsFrom({ 0: 20, 1: 32 }, 4); // rise 12 m / 0.2 km = 0.06
    const profile = buildRouteGradeProfile([0, 1], [0.2], { ...baseOpts, heights });
    expect(profile.maxAbsGrade).toBeCloseTo(0.06, 5);
    expect(profile.worstClass).toBe("rolling");
    expect(profile.passes).toEqual([]);
  });
});

describe("buildRouteGradeProfileFromPoints", () => {
  it("derives lengths from XY and heights from cells", () => {
    // points 0→1: 3 map units east, cells 0→1 with +250 m (exp=1)
    const points: Array<[number, number, number]> = [
      [0, 0, 0],
      [3, 0, 1]
    ];
    const heights = heightsFrom({ 0: 20, 1: 270 }, 4);
    const profile = buildRouteGradeProfileFromPoints(points, {
      distanceScale: 1,
      heightExponent: 1,
      heights
    });
    expect(profile.planarKm).toBeCloseTo(3, 6);
    expect(profile.totalAscentM).toBeCloseTo(250, 5);
    expect(profile.worstClass).toBe("hardPass");
  });
});

describe("passClassLabel / tagsForPass", () => {
  it("labels hardPass for UI", () => {
    expect(passClassLabel("hardPass")).toBe("Hard pass (horse)");
    expect(passClassLabel("flat")).toBe("Flat");
  });

  it("tags winterRisk from endpoint height", () => {
    const t = DEFAULT_ROUTE_GRADE_THRESHOLDS;
    expect(tagsForPass("hardPass", 40, t)).toEqual(["wagonHard", "horseHard"]);
    expect(tagsForPass("hardPass", 60, t)).toEqual(["wagonHard", "horseHard", "winterRisk"]);
    expect(tagsForPass("steep", 10, t)).toEqual(["wagonHard"]);
    expect(tagsForPass("flat", 80, t)).toEqual(["winterRisk"]);
  });
});
