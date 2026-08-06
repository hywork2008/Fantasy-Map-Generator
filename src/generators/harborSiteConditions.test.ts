import { describe, expect, it } from "vitest";
import { getCoastalHabitatCode } from "../data/coastalHabitatCatalog";
import type { PackedGraph } from "../types/PackedGraph";
import {
  computeLargeDepthShareMultiplier,
  ELEVATION_FACTOR_FLOOR,
  evaluateHarborCoastalHabitat,
  evaluateHarborElevation,
  findNearbyMaxDepthMeters,
  HARBOR_COASTAL_HABITAT_FACTOR_SANDY,
  HARBOR_COASTAL_HABITAT_FACTOR_TIDAL_FLAT,
  HARBOR_ELEVATION_IDEAL_MAX_M,
  HARBOR_ELEVATION_UNSUITABLE_MIN_M
} from "./harborSiteConditions";

describe("evaluateHarborElevation", () => {
  it("classifies sea-level land (h=20) as ideal with no capacity penalty", () => {
    const result = evaluateHarborElevation(20, 1.8);
    expect(result.tier).toBe("ideal");
    expect(result.elevationFactor).toBe(1);
    expect(result.elevationM).toBeCloseTo(3.48, 1);
  });

  it("keeps h=24 (~25m) just inside the ideal tier", () => {
    const result = evaluateHarborElevation(24, 1.8);
    expect(result.elevationM).toBeLessThan(HARBOR_ELEVATION_IDEAL_MAX_M);
    expect(result.tier).toBe("ideal");
    expect(result.elevationFactor).toBe(1);
  });

  it("classifies h=25 (~33m) as marginal, with a factor strictly between floor and 1", () => {
    const result = evaluateHarborElevation(25, 1.8);
    expect(result.elevationM).toBeGreaterThan(HARBOR_ELEVATION_IDEAL_MAX_M);
    expect(result.tier).toBe("marginal");
    expect(result.elevationFactor).toBeGreaterThan(ELEVATION_FACTOR_FLOOR);
    expect(result.elevationFactor).toBeLessThan(1);
  });

  it("classifies h=30 (~88m) as marginal, near the unsuitable boundary", () => {
    const result = evaluateHarborElevation(30, 1.8);
    expect(result.elevationM).toBeLessThan(HARBOR_ELEVATION_UNSUITABLE_MIN_M);
    expect(result.tier).toBe("marginal");
  });

  it("classifies h=31 (~101m) as unsuitable, floored at ELEVATION_FACTOR_FLOOR", () => {
    const result = evaluateHarborElevation(31, 1.8);
    expect(result.elevationM).toBeGreaterThan(HARBOR_ELEVATION_UNSUITABLE_MIN_M);
    expect(result.tier).toBe("unsuitable");
    expect(result.elevationFactor).toBe(ELEVATION_FACTOR_FLOOR);
  });

  it("keeps the 30m/100m tier boundaries fixed in meters when heightExponent changes (h boundary shifts instead)", () => {
    // At exponent=1, heightToMeters(h, 1) = h - 18, so meters == h - 18 exactly.
    const belowBoundary = evaluateHarborElevation(47, 1); // 47-18=29m -> ideal
    const aboveBoundary = evaluateHarborElevation(49, 1); // 49-18=31m -> marginal
    const unsuitable = evaluateHarborElevation(119, 1); // 119-18=101m -> unsuitable

    expect(belowBoundary.elevationM).toBe(29);
    expect(belowBoundary.tier).toBe("ideal");
    expect(aboveBoundary.elevationM).toBe(31);
    expect(aboveBoundary.tier).toBe("marginal");
    expect(unsuitable.elevationM).toBe(101);
    expect(unsuitable.tier).toBe("unsuitable");
  });
});

describe("evaluateHarborCoastalHabitat", () => {
  it("treats rockyIntertidal as ideal with no capacity penalty", () => {
    const result = evaluateHarborCoastalHabitat(getCoastalHabitatCode("rockyIntertidal"));
    expect(result.tier).toBe("ideal");
    expect(result.coastalHabitatFactor).toBe(1);
  });

  it("treats none (non-coastal sentinel) and undefined as ideal", () => {
    expect(evaluateHarborCoastalHabitat(getCoastalHabitatCode("none")).tier).toBe("ideal");
    expect(evaluateHarborCoastalHabitat(getCoastalHabitatCode("none")).coastalHabitatFactor).toBe(1);
    expect(evaluateHarborCoastalHabitat(undefined).tier).toBe("ideal");
    expect(evaluateHarborCoastalHabitat(undefined).coastalHabitatFactor).toBe(1);
  });

  it("degrades but never excludes tidalFlat", () => {
    const result = evaluateHarborCoastalHabitat(getCoastalHabitatCode("tidalFlat"));
    expect(result.tier).toBe("marginal");
    expect(result.coastalHabitatFactor).toBe(HARBOR_COASTAL_HABITAT_FACTOR_TIDAL_FLAT);
    expect(result.coastalHabitatFactor).toBeGreaterThan(0);
  });

  it("degrades sandyBeach and coastalDune identically, never excluding either", () => {
    const sandy = evaluateHarborCoastalHabitat(getCoastalHabitatCode("sandyBeach"));
    const dune = evaluateHarborCoastalHabitat(getCoastalHabitatCode("coastalDune"));
    expect(sandy.tier).toBe("marginal");
    expect(sandy.coastalHabitatFactor).toBe(HARBOR_COASTAL_HABITAT_FACTOR_SANDY);
    expect(dune).toEqual(sandy);
  });
});

// ---------------------------------------------------------------------------
// Minimal water-only BFS fixture for findNearbyMaxDepthMeters / evaluateHarborDepth.
//
// Cell layout (index = cell id), a straight chain deepening away from the coast:
//   0 – land (unused as a haven target)
//   1 – haven cell, h=19 (~2.6m deep — defineHaven() always picks the shallowest neighbor)
//   2 – 1 hop out, h=16 (~12.5m deep)
//   3 – 2 hops out, h=10 (~50m deep)
//   4 – 3 hops out, h=5 (~150m deep)
//   5 – a shallow dead-end branch off cell 1, h=18 (~5.6m), to confirm BFS takes the max not the last
// ---------------------------------------------------------------------------
function makeDepthChainPack(): PackedGraph {
  return {
    cells: {
      h: [20, 19, 16, 10, 5, 18],
      c: [[], [2, 5], [1, 3], [2, 4], [3], [1]]
    }
  } as unknown as PackedGraph;
}

describe("findNearbyMaxDepthMeters", () => {
  it("returns 0 for a falsy/unset haven cell id", () => {
    expect(findNearbyMaxDepthMeters(makeDepthChainPack(), 0, 3)).toBe(0);
  });

  it("radius 0 (no hops) reads only the haven cell's own (shallow) depth", () => {
    const depth = findNearbyMaxDepthMeters(makeDepthChainPack(), 1, 0);
    expect(depth).toBeCloseTo(2.63, 1);
  });

  it("radius 1 reaches the shallow branch cell but not the deeper 2-hop cell", () => {
    const depth = findNearbyMaxDepthMeters(makeDepthChainPack(), 1, 1);
    expect(depth).toBeCloseTo(12.5, 1); // cell 2, not cell 5 (5.6m) — BFS takes the deepest reachable
  });

  it("radius 2 reaches the 2-hop cell (~50m)", () => {
    const depth = findNearbyMaxDepthMeters(makeDepthChainPack(), 1, 2);
    expect(depth).toBeCloseTo(50, 0);
  });

  it("radius 3 reaches the deepest 3-hop cell (~150m)", () => {
    const depth = findNearbyMaxDepthMeters(makeDepthChainPack(), 1, 3);
    expect(depth).toBeCloseTo(150, 0);
  });
});

describe("computeLargeDepthShareMultiplier", () => {
  it("closes the large tier below the marginal floor", () => {
    expect(computeLargeDepthShareMultiplier(3.9)).toBe(0);
  });

  it("opens the large tier at half capacity in the 4-6m dredging band", () => {
    expect(computeLargeDepthShareMultiplier(4)).toBe(0.5);
    expect(computeLargeDepthShareMultiplier(5.9)).toBe(0.5);
  });

  it("opens the large tier at full capacity from 6m", () => {
    expect(computeLargeDepthShareMultiplier(6)).toBe(1);
    expect(computeLargeDepthShareMultiplier(150)).toBe(1);
  });
});
